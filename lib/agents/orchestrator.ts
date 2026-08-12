// Agent orchestrator — spec sections 4-8 and 13. Thin DB/email wrapper
// around the pure planner in lib/agents/analyze.ts and the pure message
// composer in lib/agents/message.ts: persists an AgentRun, logs every step
// as an AgentAction (the audit trail from spec section 14), discovers and
// contacts providers, and notifies the passenger. Deliberately not unit
// tested directly (same convention as lib/monitoring/service.ts) — the
// decision logic it wraps is tested in lib/agents/analyze.test.ts,
// lib/agents/classify.test.ts, lib/agents/contactDiscovery.test.ts, and
// lib/agents/message.test.ts.
//
// Resumable by construction: an AgentRun's `status` in the database *is*
// its execution state, so a request that gets interrupted (serverless cold
// start, crash) just leaves the run wherever it last got to — nothing is
// held in memory. Right now DETECTED -> ANALYZING -> CONTACTING all happen
// synchronously in one call (the same way initializeMonitoringForSegment
// seeds an immediate first check rather than waiting for the next cron
// tick), ending at COMPLETED, WAITING_FOR_RESPONSE, or ACTION_REQUIRED.
//
// A provider's reply, when it arrives, is handled asynchronously by
// app/api/webhooks/resend-inbound (see lib/agents/inboundReply.ts) — every
// provider-facing email's Reply-To is a per-Communication address (see
// lib/inboundReplyAddress.ts) so a reply can be matched back here without
// relying on undocumented email threading headers. A reply moves the run
// to ACTION_REQUIRED, not straight to CONFIRMED/RESCHEDULING — Maestravl
// can read that a reply arrived, not what it actually says (no LLM
// interpreting the content), so the passenger reads it and decides what it
// means, per spec section 20 (never claim a resolution that wasn't
// verified).

import { prisma } from '@/lib/db'
import { sendDisruptionImpactEmail, sendProviderEmail } from '@/lib/email'
import { segmentLabel } from '@/lib/segmentLabel'
import { buildReplyAddress } from '@/lib/inboundReplyAddress'
import { planAnalysis, type PlannerSegment } from './analyze'
import { classifyActionRisk, canAutoExecute } from './policy'
import { findOrDiscoverContact, isAutoContactable, type ProviderContactRecord } from './contact'
import { describeDisruptionReason, composeRescheduleRequest, composeAwarenessInquiry, formatTime } from './message'
import { rankAlternatives, type SegmentImpact } from '@/lib/dependency/graph'
import type { MonitoringCheckStatus } from '@/lib/monitoring/types'
import type { AgentActionType, AgentActionStatus } from '@/lib/constants'
import type { Prisma } from '@prisma/client'

async function logAction(
  agentRunId: string,
  action: {
    type: AgentActionType
    segmentId: string | null
    description: string
    detail?: unknown
    /** Overrides the policy-derived default — use when an action was actually attempted and its real outcome (not just risk tier) determines status, e.g. a send that failed. */
    status?: AgentActionStatus
  }
) {
  const riskLevel = classifyActionRisk(action.type)
  return prisma.agentAction.create({
    data: {
      agentRunId,
      segmentId: action.segmentId,
      type: action.type,
      riskLevel,
      status: action.status ?? (canAutoExecute(riskLevel) ? 'EXECUTED' : 'REQUIRES_APPROVAL'),
      description: action.description,
      detail: action.detail ? JSON.stringify(action.detail) : null,
    },
  })
}

function toPlannerSegment(segment: {
  id: string
  order: number
  transportType: string
  departureTime: Date | null
  arrivalTime: Date | null
  identifier: string | null
  provider: string | null
  departureLocationCode: string | null
  arrivalLocationCode: string | null
}): PlannerSegment {
  return {
    id: segment.id,
    order: segment.order,
    transportType: segment.transportType as PlannerSegment['transportType'],
    departureTime: segment.departureTime,
    arrivalTime: segment.arrivalTime,
    identifier: segment.identifier,
    provider: segment.provider,
    departureLocationCode: segment.departureLocationCode,
    arrivalLocationCode: segment.arrivalLocationCode,
  }
}

/**
 * Creates an AgentRun for a Disruption and immediately advances it through
 * every step currently implemented (analysis, then contacting). Once
 * provider *responses* are processed, this becomes the entry point a cron
 * tick calls repeatedly rather than something that always finishes in one
 * call.
 */
export async function startAgentRun(disruptionId: string) {
  const disruption = await prisma.disruption.findUnique({ where: { id: disruptionId } })
  if (!disruption) throw new Error(`Disruption not found: ${disruptionId}`)

  const run = await prisma.agentRun.create({
    data: { tripId: disruption.tripId, disruptionId, status: 'DETECTED' },
  })

  return runAnalysis(run.id)
}

type SegmentRow = Prisma.SegmentGetPayload<{}>
type DisruptionRow = Prisma.DisruptionGetPayload<{}>
type TripWithRelations = Prisma.TripGetPayload<{ include: { segments: true; passengers: true } }>

interface ContactOutcome {
  impact: SegmentImpact
  segment: SegmentRow
  contacted: boolean
}

async function runAnalysis(agentRunId: string) {
  const run = await prisma.agentRun.findUnique({
    where: { id: agentRunId },
    include: { disruption: true },
  })
  if (!run) throw new Error(`AgentRun not found: ${agentRunId}`)
  // Guard against double-processing (e.g. a re-entrant call) — only the
  // caller that successfully claims the DETECTED -> ANALYZING transition
  // proceeds; anything else just returns the run as it already stands.
  const claim = await prisma.agentRun.updateMany({
    where: { id: agentRunId, status: 'DETECTED' },
    data: { status: 'ANALYZING' },
  })
  if (claim.count === 0) return run

  const trip = await prisma.trip.findUnique({
    where: { id: run.tripId },
    include: { segments: { orderBy: { order: 'asc' } }, passengers: true },
  })
  if (!trip) throw new Error(`Trip not found: ${run.tripId}`)

  const disruptedSegment = trip.segments.find((s) => s.id === run.disruption.segmentId)
  if (!disruptedSegment) throw new Error(`Disrupted segment not found: ${run.disruption.segmentId}`)

  const plannerSegments = trip.segments.map(toPlannerSegment)
  const plan = planAnalysis(
    toPlannerSegment(disruptedSegment),
    plannerSegments,
    run.disruption.newStatus as MonitoringCheckStatus,
    run.disruption.delayMinutes
  )

  for (const action of plan.actions) {
    await logAction(agentRunId, action)
  }

  if (plan.affected.length === 0) {
    return prisma.agentRun.update({
      where: { id: agentRunId },
      data: { status: 'COMPLETED', summary: plan.summary, completedAt: new Date() },
    })
  }

  await prisma.agentRun.update({ where: { id: agentRunId }, data: { status: 'CONTACTING' } })

  const reasonText = describeDisruptionReason(
    segmentLabel(disruptedSegment),
    run.disruption.newStatus as MonitoringCheckStatus,
    run.disruption.delayMinutes
  )

  const contactResults: ContactOutcome[] = []
  for (const impact of plan.affected) {
    const segment = trip.segments.find((s) => s.id === impact.segmentId)
    if (!segment) continue
    contactResults.push(await contactProvider(agentRunId, segment, impact, reasonText, plannerSegments))
  }

  await notifyPassengersOfImpact(agentRunId, trip, disruptedSegment, run.disruption, plan.summary, contactResults)

  const anyContacted = contactResults.some((r) => r.contacted)
  const allContacted = contactResults.every((r) => r.contacted)
  const uncontactedCount = contactResults.filter((r) => !r.contacted).length

  const status = allContacted ? 'WAITING_FOR_RESPONSE' : 'ACTION_REQUIRED'
  const summary = allContacted
    ? `Maestravl reached out to ${contactResults.length} provider${contactResults.length === 1 ? '' : 's'} and is waiting to hear back.`
    : anyContacted
      ? `Maestravl reached out to some providers automatically; ${uncontactedCount} other reservation${uncontactedCount === 1 ? '' : 's'} still need${uncontactedCount === 1 ? 's' : ''} your attention.`
      : plan.summary

  return prisma.agentRun.update({
    where: { id: agentRunId },
    data: { status, summary, completedAt: null },
  })
}

/** Finds a contact for one affected segment and, if one is usable, sends a request. Always logs FIND_CONTACT; only logs CONTACT_PROVIDER/REQUEST_RESCHEDULE if a send was actually attempted. */
async function contactProvider(
  agentRunId: string,
  segment: SegmentRow,
  impact: SegmentImpact,
  reasonText: string,
  allSegments: PlannerSegment[]
): Promise<ContactOutcome> {
  const label = segmentLabel(segment)
  const contact = await findOrDiscoverContact(segment.id)

  await logAction(agentRunId, {
    type: 'FIND_CONTACT',
    segmentId: segment.id,
    description: contact
      ? `Found a ${contact.channel.toLowerCase()} contact for ${label} (confidence ${contact.confidence}, from the ${contact.source.toLowerCase().replace('_', ' ')}).`
      : `No usable contact information found for ${label} in the booking confirmation or itinerary notes.`,
  })

  if (!isAutoContactable(contact)) {
    if (contact) {
      await logAction(agentRunId, {
        type: 'ESCALATE',
        segmentId: segment.id,
        description: `Only a low-confidence or non-email contact was found for ${label} — not contacting automatically.`,
      })
    }
    return { impact, segment, contacted: false }
  }

  return sendContactRequest(agentRunId, segment, impact, contact, label, reasonText, allSegments)
}

/**
 * Rescheduling Agent (spec section 8) for a DIRECT impact: ranks a primary
 * ask plus a modest fallback (see rankAlternatives), persists both as
 * Alternative rows for the audit trail, and returns the fallback time (or
 * null) for composeRescheduleRequest to fold into the actual message. Only
 * ever proposes times Maestravl computed itself — never a claim about real
 * provider availability, which nothing in this codebase can check.
 */
async function proposeAlternatives(agentRunId: string, segment: SegmentRow, label: string, shiftedStart: Date, allSegments: PlannerSegment[]): Promise<Date | null> {
  const options = rankAlternatives(allSegments, segment.id, shiftedStart)
  if (options.length === 0) return null

  await prisma.alternative.createMany({
    data: options.map((o) => ({
      agentRunId,
      segmentId: segment.id,
      label: o.label,
      proposedTime: o.proposedTime,
      downstreamImpact: o.downstreamImpact,
      rank: o.rank,
      selected: o.rank === 1,
    })),
  })

  const [primary, backup] = options
  await logAction(agentRunId, {
    type: 'SEARCH_ALTERNATIVES',
    segmentId: segment.id,
    description: backup
      ? `Considered timing options for ${label} — asking for ${formatTime(primary.proposedTime, segment.timezone)}, with ${formatTime(backup.proposedTime, segment.timezone)} as a fallback.`
      : `Considered timing options for ${label}.`,
  })

  return backup?.proposedTime ?? null
}

async function sendContactRequest(
  agentRunId: string,
  segment: SegmentRow,
  impact: SegmentImpact,
  contact: ProviderContactRecord,
  label: string,
  reasonText: string,
  allSegments: PlannerSegment[]
): Promise<ContactOutcome> {
  const alternativeTime = impact.shiftedStart
    ? await proposeAlternatives(agentRunId, segment, label, impact.shiftedStart, allSegments)
    : null

  const message = impact.shiftedStart
    ? composeRescheduleRequest({
        segmentLabel: label,
        confirmationNumber: segment.confirmationNumber,
        originalTime: segment.departureTime ?? segment.arrivalTime,
        proposedTime: impact.shiftedStart,
        alternativeTime,
        timezone: segment.timezone,
        reasonText,
      })
    : composeAwarenessInquiry({ segmentLabel: label, confirmationNumber: segment.confirmationNumber, reasonText })

  const communication = await prisma.communication.create({
    data: {
      agentRunId,
      segmentId: segment.id,
      contactId: contact.id,
      direction: 'OUTBOUND',
      channel: contact.channel,
      subject: message.subject,
      content: message.body,
      status: 'DRAFTED',
    },
  })

  try {
    await sendProviderEmail(contact.value, message.subject, message.body, buildReplyAddress(communication.id) ?? undefined)
    await prisma.communication.update({ where: { id: communication.id }, data: { status: 'SENT', sentAt: new Date() } })
    await logAction(agentRunId, {
      type: 'CONTACT_PROVIDER',
      segmentId: segment.id,
      description: `Sent a request to ${label}'s provider (${contact.value}).`,
      status: 'EXECUTED',
    })

    if (impact.shiftedStart) {
      await prisma.rescheduleRequest.create({
        data: { agentRunId, segmentId: segment.id, requestedTime: impact.shiftedStart, reason: reasonText, status: 'REQUESTED' },
      })
      await logAction(agentRunId, {
        type: 'REQUEST_RESCHEDULE',
        segmentId: segment.id,
        description: `Requested moving ${label} to ${formatTime(impact.shiftedStart, segment.timezone)}.`,
        status: 'EXECUTED',
      })
    }

    return { impact, segment, contacted: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    await prisma.communication.update({ where: { id: communication.id }, data: { status: 'FAILED', errorMessage } })
    await logAction(agentRunId, {
      type: 'CONTACT_PROVIDER',
      segmentId: segment.id,
      description: `Failed to send a request to ${label}'s provider.`,
      detail: { error: errorMessage },
      status: 'FAILED',
    })
    return { impact, segment, contacted: false }
  }
}

async function notifyPassengersOfImpact(
  agentRunId: string,
  trip: TripWithRelations,
  disruptedSegment: SegmentRow,
  disruption: DisruptionRow,
  fallbackReason: string,
  contactResults: ContactOutcome[]
) {
  const disruptedLabel = segmentLabel(disruptedSegment)
  const affected = contactResults.map(({ impact, segment, contacted }) => ({
    label: segmentLabel(segment),
    reason: impact.reason || fallbackReason,
    contacted,
  }))

  const recipients = trip.passengers.filter((p) => p.email)
  let anySucceeded = false
  const results: { recipient: string; success: boolean; error?: string }[] = []

  for (const passenger of recipients) {
    try {
      await sendDisruptionImpactEmail(passenger.email!, {
        recipientName: passenger.name,
        tripTitle: trip.title,
        disruptedSegmentLabel: disruptedLabel,
        newStatus: disruption.newStatus,
        delayMinutes: disruption.delayMinutes,
        newDepartureTime: disruption.newDepartureTime,
        timezone: disruptedSegment.timezone,
        affected,
      })
      anySucceeded = true
      results.push({ recipient: passenger.email!, success: true })
    } catch (err) {
      results.push({ recipient: passenger.email!, success: false, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  await logAction(agentRunId, {
    type: 'NOTIFY_PASSENGER',
    segmentId: null,
    description:
      recipients.length === 0
        ? 'No passenger email on file — could not send the impact summary.'
        : anySucceeded
          ? 'Passenger notified of the disruption and what it affects.'
          : 'Failed to notify passenger of the disruption impact.',
    detail: results,
    status: recipients.length === 0 ? 'FAILED' : anySucceeded ? 'EXECUTED' : 'FAILED',
  })
}

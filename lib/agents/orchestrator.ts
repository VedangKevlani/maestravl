// Agent orchestrator — spec sections 4-5 and 13. Thin DB/email wrapper
// around the pure planner in lib/agents/analyze.ts: persists an AgentRun,
// logs every step as an AgentAction (the audit trail from spec section 14),
// and notifies the passenger. Deliberately not unit tested directly (same
// convention as lib/monitoring/service.ts) — the decision logic it wraps
// is tested in lib/agents/analyze.test.ts and lib/agents/classify.test.ts.
//
// Resumable by construction: an AgentRun's `status` in the database *is*
// its execution state, so a request that gets interrupted (serverless cold
// start, crash) just leaves the run wherever it last got to — nothing is
// held in memory. There's currently exactly one real transition
// (DETECTED -> COMPLETED | ACTION_REQUIRED), run synchronously right after
// the triggering Disruption is created, the same way
// initializeMonitoringForSegment seeds an immediate first check rather
// than waiting for the next cron tick. CONTACTING / WAITING_FOR_RESPONSE /
// RESCHEDULING are reserved for the contact-discovery and communication
// agents (not built yet) to land in without another migration.

import { prisma } from '@/lib/db'
import { sendDisruptionImpactEmail } from '@/lib/email'
import { segmentLabel } from '@/lib/segmentLabel'
import { planAnalysis, type PlannerSegment } from './analyze'
import { classifyActionRisk, canAutoExecute } from './policy'
import type { MonitoringCheckStatus } from '@/lib/monitoring/types'
import type { AgentActionType } from '@/lib/constants'
import type { Prisma } from '@prisma/client'

async function logAction(
  agentRunId: string,
  action: { type: AgentActionType; segmentId: string | null; description: string; detail?: unknown }
) {
  const riskLevel = classifyActionRisk(action.type)
  return prisma.agentAction.create({
    data: {
      agentRunId,
      segmentId: action.segmentId,
      type: action.type,
      riskLevel,
      status: canAutoExecute(riskLevel) ? 'EXECUTED' : 'REQUIRES_APPROVAL',
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
 * Creates an AgentRun for a Disruption and immediately advances it — there
 * is only one real step implemented right now (analysis), so "advance" and
 * "run to its current stopping point" are the same operation for now. Once
 * CONTACTING/RESCHEDULING exist, this becomes the entry point a cron tick
 * calls repeatedly rather than something that always finishes in one call.
 */
export async function startAgentRun(disruptionId: string) {
  const disruption = await prisma.disruption.findUnique({ where: { id: disruptionId } })
  if (!disruption) throw new Error(`Disruption not found: ${disruptionId}`)

  const run = await prisma.agentRun.create({
    data: { tripId: disruption.tripId, disruptionId, status: 'DETECTED' },
  })

  return runAnalysis(run.id)
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

  const plan = planAnalysis(
    toPlannerSegment(disruptedSegment),
    trip.segments.map(toPlannerSegment),
    run.disruption.newStatus as MonitoringCheckStatus,
    run.disruption.delayMinutes
  )

  for (const action of plan.actions) {
    await logAction(agentRunId, action)
  }

  if (plan.affected.length > 0) {
    await notifyPassengersOfImpact(agentRunId, trip, disruptedSegment, run.disruption, plan)
  }

  return prisma.agentRun.update({
    where: { id: agentRunId },
    data: {
      status: plan.outcome,
      summary: plan.summary,
      completedAt: plan.outcome === 'COMPLETED' ? new Date() : null,
    },
  })
}

type TripWithRelations = Prisma.TripGetPayload<{ include: { segments: true; passengers: true } }>
type SegmentRow = Prisma.SegmentGetPayload<{}>
type DisruptionRow = Prisma.DisruptionGetPayload<{}>
type AnalysisPlan = ReturnType<typeof planAnalysis>

async function notifyPassengersOfImpact(
  agentRunId: string,
  trip: TripWithRelations,
  disruptedSegment: SegmentRow,
  disruption: DisruptionRow,
  plan: AnalysisPlan
) {
  const disruptedLabel = segmentLabel(disruptedSegment)
  const affectedLabels = plan.affected.map((impact) => {
    const segment = trip.segments.find((s: SegmentRow) => s.id === impact.segmentId)
    return { label: segment ? segmentLabel(segment) : 'A later segment', reason: impact.reason }
  })

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
        affected: affectedLabels,
      })
      anySucceeded = true
      results.push({ recipient: passenger.email!, success: true })
    } catch (err) {
      results.push({ recipient: passenger.email!, success: false, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  await prisma.agentAction.create({
    data: {
      agentRunId,
      segmentId: null,
      type: 'NOTIFY_PASSENGER',
      riskLevel: 'LOW',
      status: recipients.length === 0 ? 'FAILED' : anySucceeded ? 'EXECUTED' : 'FAILED',
      description:
        recipients.length === 0
          ? 'No passenger email on file — could not send the impact summary.'
          : anySucceeded
            ? 'Passenger notified of the disruption and what it affects.'
            : 'Failed to notify passenger of the disruption impact.',
      detail: JSON.stringify(results),
    },
  })
}

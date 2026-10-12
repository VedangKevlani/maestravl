// DB-touching half of inbound reply handling — called by
// app/api/webhooks/resend-inbound once a webhook has been verified and the
// full email fetched. Not unit tested directly (DB-touching, same
// convention as lib/agents/orchestrator.ts) — extractReplyContent and
// friends in lib/agents/replyText.ts are what's tested, as is
// decideRunTransition in lib/agents/replyInterpretation.ts.

import { prisma } from '@/lib/db'
import { segmentLabel } from '@/lib/segmentLabel'
import { isTerminalRunStatus } from '@/lib/constants'
import { withdrawPendingFollowUps } from './followUp'
import { extractCounterOfferTime } from './counterOffer'
import { rankAlternatives, type DependencySegment } from '@/lib/dependency/graph'
import { formatFriendlyTime, resolveSegmentZones } from '@/lib/dateFormat'
import { extractReplyContent, snippetOf } from './replyText'
import { classifyReply, decideRunTransition } from './replyInterpretation'
import type { ReceivedEmail } from '@/lib/email'

export type InboundReplyResult =
  | { processed: true }
  | { processed: false; reason: 'unknown_communication' | 'already_processed' }

/**
 * Records a provider's reply against the Communication it's replying to
 * (identified by the caller via lib/inboundReplyAddress.ts) and surfaces it
 * on the AgentRun. Idempotent — a webhook retry for the same email finds
 * the Communication already RESPONDED and no-ops rather than double-logging.
 *
 * A best-effort Gemini read of what the reply means (see
 * lib/agents/replyInterpretation.ts) can move the run to RESCHEDULING, but
 * never straight to CONFIRMED — spec section 20, never claim a resolution
 * that wasn't verified. RESCHEDULING still requires the passenger's
 * explicit confirm (app/api/agent-runs/[id]/confirm-reschedule) before the
 * itinerary actually changes; the raw reply is always shown alongside the
 * interpretation, never replaced by it. If interpretation fails or isn't
 * configured, this degrades to exactly the prior behavior: ACTION_REQUIRED,
 * passenger reads the reply themselves.
 */
export async function processInboundReply(communicationId: string, email: ReceivedEmail): Promise<InboundReplyResult> {
  const outbound = await prisma.communication.findUnique({
    where: { id: communicationId },
    include: { segment: true },
  })
  if (!outbound || outbound.direction !== 'OUTBOUND') {
    return { processed: false, reason: 'unknown_communication' }
  }
  if (outbound.status === 'RESPONDED') {
    return { processed: false, reason: 'already_processed' }
  }

  const content = extractReplyContent(email) || '(No readable content — see the original email in Resend.)'
  const label = segmentLabel(outbound.segment)

  await prisma.communication.create({
    data: {
      agentRunId: outbound.agentRunId,
      segmentId: outbound.segmentId,
      contactId: outbound.contactId,
      direction: 'INBOUND',
      channel: outbound.channel,
      subject: email.subject || null,
      content,
      status: 'DELIVERED',
    },
  })

  await prisma.communication.update({
    where: { id: outbound.id },
    data: { status: 'RESPONDED', respondedAt: new Date() },
  })
  // They answered, so a follow-up still waiting on the passenger's OK for
  // this provider is moot (lib/agents/followUp.ts).
  await withdrawPendingFollowUps(outbound.agentRunId, outbound.segmentId)

  const [rescheduleRequest, primaryAlternative, backupAlternative] = await Promise.all([
    prisma.rescheduleRequest.findFirst({
      where: { agentRunId: outbound.agentRunId, segmentId: outbound.segmentId, status: 'REQUESTED' },
    }),
    prisma.alternative.findFirst({
      where: { agentRunId: outbound.agentRunId, segmentId: outbound.segmentId, rank: 1 },
    }),
    prisma.alternative.findFirst({
      where: { agentRunId: outbound.agentRunId, segmentId: outbound.segmentId, rank: 2 },
    }),
  ])

  const interpretation = await classifyReply({
    replyText: content,
    segmentLabel: label,
    requestedTime: rescheduleRequest?.requestedTime ?? null,
    alternativeTime: backupAlternative?.proposedTime ?? null,
    timezone: outbound.segment.timezone,
  })

  // Record which of the two offered times was actually accepted — without
  // this, confirm-reschedule has no way to tell "yes to the primary time"
  // apart from "yes to the fallback time" and always applies the primary
  // one regardless (a real bug: a real reply accepted the fallback and
  // would have been silently rescheduled to the wrong time). Alternative's
  // `selected` field already existed, but for a different purpose —
  // orchestrator.ts's SEARCH_ALTERNATIVES defaults rank 1 to selected:true
  // at creation time — so this has to explicitly *move* the flag (set the
  // matched one true AND the other false), not just set the matched one
  // true, or the two meanings collide and a stale default can outrank a
  // real reply-driven selection.
  if (interpretation.intent === 'ACCEPTED' && (primaryAlternative || backupAlternative)) {
    const wantsAlternative = interpretation.matchedTime === 'ALTERNATIVE'
    if (primaryAlternative) {
      await prisma.alternative.update({ where: { id: primaryAlternative.id }, data: { selected: !wantsAlternative } })
    }
    if (backupAlternative) {
      await prisma.alternative.update({ where: { id: backupAlternative.id }, data: { selected: wantsAlternative } })
    }
  }

  // A counter-offer naming exactly one new time becomes a selectable
  // Alternative, so the passenger can accept it with the same "Confirm —
  // update itinerary" step as any reschedule (confirmReschedule.ts applies
  // the selected Alternative). Read deterministically — no extra Gemini
  // call — and only ever proposed, never applied, here.
  let counterOfferText: string | null = null
  if (interpretation.intent === 'COUNTER_OFFER' && rescheduleRequest) {
    const zone = resolveSegmentZones(outbound.segment).departure
    const offeredTimes = [rescheduleRequest.requestedTime, primaryAlternative?.proposedTime, backupAlternative?.proposedTime].filter((t): t is Date => Boolean(t))
    const counterTime = extractCounterOfferTime(content, { referenceTime: rescheduleRequest.requestedTime, timezone: zone, offeredTimes })
    if (counterTime) {
      const tripSegments = await prisma.segment.findMany({
        where: { tripId: outbound.segment.tripId },
        select: { id: true, order: true, transportType: true, departureTime: true, arrivalTime: true },
      })
      const impact = rankAlternatives(tripSegments as DependencySegment[], outbound.segmentId, counterTime)[0]?.downstreamImpact ?? 'NONE'
      await prisma.alternative.updateMany({ where: { agentRunId: outbound.agentRunId, segmentId: outbound.segmentId }, data: { selected: false } })
      await prisma.alternative.create({
        data: {
          agentRunId: outbound.agentRunId,
          segmentId: outbound.segmentId,
          label: "Provider's counter-offer",
          proposedTime: counterTime,
          downstreamImpact: impact,
          rank: 3,
          selected: true,
        },
      })
      counterOfferText =
        formatFriendlyTime(counterTime, zone) +
        (impact === 'MAJOR' ? ' (heads up: that would clash with what comes next on your trip)' : impact === 'MINOR' ? ' (that leaves a tight gap before what comes next)' : '')
    }
  }

  await prisma.agentAction.create({
    data: {
      agentRunId: outbound.agentRunId,
      segmentId: outbound.segmentId,
      type: 'VERIFY',
      riskLevel: 'LOW',
      status: 'EXECUTED',
      description: `${label}'s provider replied: "${snippetOf(content)}"`,
      detail: JSON.stringify({ emailId: email.id, from: email.from, interpretation }),
    },
  })

  // Shared terminal definition (lib/constants.ts) rather than a local list —
  // the local one predated SUPERSEDED, so a provider replying late to a
  // run a newer delay report had already replaced would reopen that stale
  // run alongside the new one: two "open" runs for one segment, the exact
  // state lib/agents/detect.ts supersedes runs to prevent. The reply itself
  // is still recorded above either way.
  const run = await prisma.agentRun.findUnique({ where: { id: outbound.agentRunId } })
  if (run && !isTerminalRunStatus(run.status)) {
    const transition = decideRunTransition(interpretation, Boolean(rescheduleRequest), label, counterOfferText)
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: transition.status, summary: transition.summary },
    })
  }

  return { processed: true }
}

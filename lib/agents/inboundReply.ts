// DB-touching half of inbound reply handling — called by
// app/api/webhooks/resend-inbound once a webhook has been verified and the
// full email fetched. Not unit tested directly (DB-touching, same
// convention as lib/agents/orchestrator.ts) — extractReplyContent and
// friends in lib/agents/replyText.ts are what's tested, as is
// decideRunTransition in lib/agents/replyInterpretation.ts.

import { prisma } from '@/lib/db'
import { segmentLabel } from '@/lib/segmentLabel'
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

  const [rescheduleRequest, backupAlternative] = await Promise.all([
    prisma.rescheduleRequest.findFirst({
      where: { agentRunId: outbound.agentRunId, segmentId: outbound.segmentId, status: 'REQUESTED' },
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

  const run = await prisma.agentRun.findUnique({ where: { id: outbound.agentRunId } })
  const terminal = run?.status === 'COMPLETED' || run?.status === 'FAILED' || run?.status === 'CONFIRMED'
  if (run && !terminal) {
    const transition = decideRunTransition(interpretation, Boolean(rescheduleRequest), label)
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: transition.status, summary: transition.summary },
    })
  }

  return { processed: true }
}

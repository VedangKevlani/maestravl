// DB-touching half of inbound reply handling — called by
// app/api/webhooks/resend-inbound once a webhook has been verified and the
// full email fetched. Not unit tested directly (DB-touching, same
// convention as lib/agents/orchestrator.ts) — extractReplyContent and
// friends in lib/agents/replyText.ts are what's tested.

import { prisma } from '@/lib/db'
import { segmentLabel } from '@/lib/segmentLabel'
import { extractReplyContent, snippetOf } from './replyText'
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
 * Deliberately does not move the run to CONFIRMED/RESCHEDULING: Maestravl
 * knows a reply arrived, not what it says (no LLM reading it), so the run
 * goes to ACTION_REQUIRED and the passenger reads the actual reply
 * themselves — spec section 20, never claim a resolution that wasn't
 * verified.
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

  await prisma.agentAction.create({
    data: {
      agentRunId: outbound.agentRunId,
      segmentId: outbound.segmentId,
      type: 'VERIFY',
      riskLevel: 'LOW',
      status: 'EXECUTED',
      description: `${label}'s provider replied: "${snippetOf(content)}"`,
      detail: JSON.stringify({ emailId: email.id, from: email.from }),
    },
  })

  const run = await prisma.agentRun.findUnique({ where: { id: outbound.agentRunId } })
  const terminal = run?.status === 'COMPLETED' || run?.status === 'FAILED' || run?.status === 'CONFIRMED'
  if (run && !terminal) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: 'ACTION_REQUIRED', summary: `${label}'s provider replied — take a look at what they said.` },
    })
  }

  return { processed: true }
}

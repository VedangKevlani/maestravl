// The other half of lib/agents/orchestrator.ts's draftContactRequest: once
// a contact is found for an affected segment's provider, the run stops at
// AWAITING_APPROVAL instead of sending anything — a wrong or stale contact
// means a real, unsolicited email to a real stranger, which is exactly the
// kind of action this pipeline shouldn't take on its own judgment (the
// same trust boundary as confirmReschedule.ts's "the passenger, not the
// model, has final say"). This module is what actually sends, once that
// approval is given, or records that it was declined.
import { prisma } from '@/lib/db'
import { sendProviderEmail } from '@/lib/email'
import { buildReplyAddress } from '@/lib/inboundReplyAddress'
import { segmentLabel } from '@/lib/segmentLabel'
import { formatTime } from './message'
import { computeContactPhaseStatus, type ContactOutcome } from './orchestrator'
import type { AgentRun } from '@prisma/client'

export type ApproveContactResult =
  | { status: 'not_found' }
  | { status: 'not_pending' }
  | { status: 'declined'; agentRun: AgentRun }
  | { status: 'sent'; agentRun: AgentRun }
  | { status: 'send_failed'; agentRun: AgentRun }

interface PendingDetail {
  communicationId: string
  requestedTime: string | null
  reasonText: string
  label: string
}

/**
 * Rebuilds this run's full contact picture from the database rather than
 * trusting only the one decision just made — a run can have several
 * affected segments, each with its own pending/sent/declined contact
 * action, so "what's the run's overall status now" has to look at all of
 * them. Reuses computeContactPhaseStatus (shared with orchestrator.ts's
 * initial pass) so the two never define "what counts as done" differently.
 */
async function recomputeRunStatus(agentRunId: string) {
  const actions = await prisma.agentAction.findMany({
    where: { agentRunId, type: 'CONTACT_PROVIDER' },
    orderBy: { createdAt: 'asc' },
  })

  // Only the latest CONTACT_PROVIDER action per segment reflects that
  // segment's current outcome — REQUIRES_APPROVAL rows get superseded by
  // an EXECUTED or the decline's own bookkeeping as decisions land.
  const latestBySegment = new Map<string, (typeof actions)[number]>()
  for (const a of actions) if (a.segmentId) latestBySegment.set(a.segmentId, a)

  const outcomes: Pick<ContactOutcome, 'contacted' | 'pendingApprovalCommunicationId'>[] = [...latestBySegment.values()].map((a) => ({
    contacted: a.status === 'EXECUTED',
    pendingApprovalCommunicationId: a.status === 'REQUIRES_APPROVAL' ? (JSON.parse(a.detail ?? '{}') as Partial<PendingDetail>).communicationId : undefined,
  }))

  return computeContactPhaseStatus(outcomes as ContactOutcome[], 'Maestravl is still working on this.')
}

export async function approveContactRequest(agentRunId: string, communicationId: string, approve: boolean): Promise<ApproveContactResult> {
  const run = await prisma.agentRun.findUnique({ where: { id: agentRunId } })
  if (!run) return { status: 'not_found' }
  if (run.status !== 'AWAITING_APPROVAL') return { status: 'not_pending' }

  const communication = await prisma.communication.findUnique({
    where: { id: communicationId },
    include: { contact: true, segment: true },
  })
  if (!communication || communication.agentRunId !== agentRunId || communication.status !== 'DRAFTED' || !communication.contact) {
    return { status: 'not_pending' }
  }

  const action = await prisma.agentAction.findFirst({
    where: { agentRunId, type: 'CONTACT_PROVIDER', status: 'REQUIRES_APPROVAL', segmentId: communication.segmentId },
    orderBy: { createdAt: 'desc' },
  })
  const detail: Partial<PendingDetail> = action?.detail ? JSON.parse(action.detail) : {}
  const label = detail.label ?? segmentLabel(communication.segment)

  if (!approve) {
    await prisma.agentAction.create({
      data: {
        agentRunId,
        segmentId: communication.segmentId,
        type: 'ESCALATE',
        riskLevel: 'LOW',
        status: 'EXECUTED',
        description: `You chose not to have Maestravl contact ${label}'s provider automatically — reach out directly if you'd like.`,
      },
    })
    const { status, summary } = await recomputeRunStatus(agentRunId)
    const updated = await prisma.agentRun.update({ where: { id: agentRunId }, data: { status, summary } })
    return { status: 'declined', agentRun: updated }
  }

  try {
    await sendProviderEmail(
      communication.contact.value,
      communication.subject ?? `Request regarding ${label}`,
      communication.content,
      buildReplyAddress(communication.id) ?? undefined
    )
    await prisma.communication.update({ where: { id: communication.id }, data: { status: 'SENT', sentAt: new Date() } })
    await prisma.agentAction.create({
      data: {
        agentRunId,
        segmentId: communication.segmentId,
        type: 'CONTACT_PROVIDER',
        riskLevel: 'LOW',
        status: 'EXECUTED',
        description: `Sent a request to ${label}'s provider (${communication.contact.value}).`,
      },
    })

    if (detail.requestedTime) {
      const requestedTime = new Date(detail.requestedTime)
      await prisma.rescheduleRequest.create({
        data: { agentRunId, segmentId: communication.segmentId, requestedTime, reason: detail.reasonText ?? '', status: 'REQUESTED' },
      })
      await prisma.agentAction.create({
        data: {
          agentRunId,
          segmentId: communication.segmentId,
          type: 'REQUEST_RESCHEDULE',
          riskLevel: 'LOW',
          status: 'EXECUTED',
          description: `Requested moving ${label} to ${formatTime(requestedTime, communication.segment.timezone)}.`,
        },
      })
    }

    const { status, summary } = await recomputeRunStatus(agentRunId)
    const updated = await prisma.agentRun.update({ where: { id: agentRunId }, data: { status, summary } })
    return { status: 'sent', agentRun: updated }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    await prisma.communication.update({ where: { id: communication.id }, data: { status: 'FAILED', errorMessage } })
    await prisma.agentAction.create({
      data: {
        agentRunId,
        segmentId: communication.segmentId,
        type: 'CONTACT_PROVIDER',
        riskLevel: 'LOW',
        status: 'FAILED',
        description: `Failed to send a request to ${label}'s provider.`,
        detail: JSON.stringify({ error: errorMessage }),
      },
    })
    const { status, summary } = await recomputeRunStatus(agentRunId)
    const updated = await prisma.agentRun.update({ where: { id: agentRunId }, data: { status, summary } })
    return { status: 'send_failed', agentRun: updated }
  }
}

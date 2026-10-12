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
  /** Set on a follow-up nudge (lib/agents/followUp.ts) — the id of the original, already-sent request. */
  followUpOf?: string
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
  // segment's current outcome — a REQUIRES_APPROVAL row is claimed as
  // APPROVED (then followed by an EXECUTED/FAILED send) or SKIPPED (a
  // decline) by approveContactRequest as decisions land.
  const latestBySegment = new Map<string, (typeof actions)[number]>()
  for (const a of actions) if (a.segmentId) latestBySegment.set(a.segmentId, a)

  const outcomes: Pick<ContactOutcome, 'contacted' | 'pendingApprovalCommunicationId'>[] = [...latestBySegment.values()].map((a) => {
    const detail = JSON.parse(a.detail ?? '{}') as Partial<PendingDetail>
    return {
      // A follow-up only exists because the original request already went
      // out, so that provider has been contacted whether the nudge itself
      // was sent, declined (SKIPPED), or failed to send.
      contacted: a.status === 'EXECUTED' || (Boolean(detail.followUpOf) && a.status !== 'REQUIRES_APPROVAL'),
      pendingApprovalCommunicationId: a.status === 'REQUIRES_APPROVAL' ? detail.communicationId : undefined,
    }
  })

  return computeContactPhaseStatus(outcomes as ContactOutcome[], 'Maestravl is still working on this.')
}

/**
 * Which address to send to instead of the one Contact Discovery picked —
 * either another address already on file for this segment (`contactId`)
 * or one the passenger typed (`customEmail`, saved as a MANUAL contact).
 */
export interface RecipientOverride {
  contactId?: string
  customEmail?: string
}

export async function approveContactRequest(
  agentRunId: string,
  communicationId: string,
  approve: boolean,
  override: RecipientOverride = {}
): Promise<ApproveContactResult | { status: 'invalid_contact' }> {
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

  // Resolved before claiming the decision, so a bad override can't leave
  // the approval half-made. A contactId must belong to this very segment —
  // the passenger can't point the draft at some other trip's address.
  let recipient = communication.contact
  if (approve && override.contactId && override.contactId !== recipient.id) {
    const chosen = await prisma.providerContact.findUnique({ where: { id: override.contactId } })
    if (!chosen || chosen.segmentId !== communication.segmentId || chosen.channel !== 'EMAIL') return { status: 'invalid_contact' }
    recipient = chosen
  } else if (approve && override.customEmail) {
    const value = override.customEmail.trim().toLowerCase()
    recipient =
      (await prisma.providerContact.findFirst({ where: { segmentId: communication.segmentId, channel: 'EMAIL', value } })) ??
      (await prisma.providerContact.create({
        data: { segmentId: communication.segmentId, channel: 'EMAIL', value, source: 'MANUAL', confidence: 100 },
      }))
  }

  const action = await prisma.agentAction.findFirst({
    where: { agentRunId, type: 'CONTACT_PROVIDER', status: 'REQUIRES_APPROVAL', segmentId: communication.segmentId },
    orderBy: { createdAt: 'desc' },
  })
  if (!action) return { status: 'not_pending' }

  // The pending action is both the "is this still waiting on you" marker
  // (recomputeRunStatus and the trip page both read the latest
  // CONTACT_PROVIDER action per segment) and the lock for this decision.
  // Claiming it atomically means a double-click or a retried request can't
  // pass the DRAFTED check twice and email a real provider twice; moving it
  // out of REQUIRES_APPROVAL is also what makes a decline actually stick —
  // previously a decline only logged an ESCALATE action, so this row stayed
  // pending, the run stayed AWAITING_APPROVAL, and the prompt came back.
  const claim = await prisma.agentAction.updateMany({
    where: { id: action.id, status: 'REQUIRES_APPROVAL' },
    data: { status: approve ? 'APPROVED' : 'SKIPPED' },
  })
  if (claim.count === 0) return { status: 'not_pending' }

  const detail: Partial<PendingDetail> = action.detail ? JSON.parse(action.detail) : {}
  const label = detail.label ?? segmentLabel(communication.segment)

  if (!approve) {
    await prisma.agentAction.create({
      data: {
        agentRunId,
        segmentId: communication.segmentId,
        type: 'ESCALATE',
        riskLevel: 'LOW',
        status: 'EXECUTED',
        description: detail.followUpOf
          ? `You chose not to send ${label}'s provider a follow-up — Maestravl will keep watching for their reply.`
          : `You chose not to have Maestravl contact ${label}'s provider automatically — reach out directly if you'd like.`,
      },
    })
    const { status, summary } = await recomputeRunStatus(agentRunId)
    const updated = await prisma.agentRun.update({ where: { id: agentRunId }, data: { status, summary } })
    return { status: 'declined', agentRun: updated }
  }

  // The Communication records who it actually went to — the audit trail
  // must match the real recipient when the passenger picked a different one.
  if (recipient.id !== communication.contactId) {
    await prisma.communication.update({ where: { id: communication.id }, data: { contactId: recipient.id } })
  }

  try {
    await sendProviderEmail(
      recipient.value,
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
        description: `Sent ${detail.followUpOf ? 'a follow-up' : 'a request'} to ${label}'s provider (${recipient.value})${recipient.id !== communication.contactId ? ' — the address you chose' : ''}.`,
        detail: detail.followUpOf ? JSON.stringify({ followUpOf: detail.followUpOf }) : null,
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
        description: `Failed to send ${detail.followUpOf ? 'a follow-up' : 'a request'} to ${label}'s provider.`,
        detail: JSON.stringify({ error: errorMessage, ...(detail.followUpOf ? { followUpOf: detail.followUpOf } : {}) }),
      },
    })
    const { status, summary } = await recomputeRunStatus(agentRunId)
    const updated = await prisma.agentRun.update({ where: { id: agentRunId }, data: { status, summary } })
    return { status: 'send_failed', agentRun: updated }
  }
}

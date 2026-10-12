// Remind-on-silence — when a provider hasn't answered Maestravl's request
// after FOLLOW_UP_AFTER_MS, draft one polite follow-up and ask the
// passenger whether to send it. Runs from the monitoring cron
// (app/api/cron/monitoring). Deterministic rules, no AI.
//
// Never sends anything itself: the draft goes through exactly the same
// approval gate as a first contact (lib/agents/approveContact.ts), so the
// passenger sees the message, can change the recipient, or decline. At
// most ONE follow-up per provider per run — Maestravl nudges, it doesn't
// nag a business on someone's behalf. A reply arriving in the meantime
// cancels the pending draft (lib/agents/inboundReply.ts).
import { prisma } from '@/lib/db'
import { segmentLabel } from '@/lib/segmentLabel'
import { composeFollowUp } from './message'

export const FOLLOW_UP_AFTER_MS = 6 * 60 * 60_000
const MAX_OUTBOUND_PER_SEGMENT = 2 // the original request + one follow-up

export interface CommunicationLike {
  id: string
  segmentId: string
  direction: string
  status: string
  sentAt: Date | null
  createdAt: Date
}

/**
 * Pure — given every Communication on one run for one segment, the original
 * request that should get a follow-up now, or null. Only when: the provider
 * has never replied, the latest outbound message actually went out (SENT,
 * not a draft or a failure) at least FOLLOW_UP_AFTER_MS ago, and no
 * follow-up has been sent or drafted yet.
 */
export function followUpTarget(communications: CommunicationLike[], now: Date, afterMs = FOLLOW_UP_AFTER_MS): CommunicationLike | null {
  if (communications.some((c) => c.direction === 'INBOUND')) return null
  const outbound = communications.filter((c) => c.direction === 'OUTBOUND').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  if (outbound.length === 0 || outbound.length >= MAX_OUTBOUND_PER_SEGMENT) return null
  const latest = outbound[outbound.length - 1]
  if (latest.status !== 'SENT' || !latest.sentAt) return null
  if (now.getTime() - latest.sentAt.getTime() < afterMs) return null
  return latest
}

/**
 * Drafts follow-ups for every waiting run that needs one. Returns how many
 * drafts were created. `runIds` narrows it to specific runs (the cron
 * passes nothing; a test or a single-trip check scopes it so it can't touch
 * anyone else's runs).
 */
export async function draftFollowUps(now = new Date(), opts: { runIds?: string[] } = {}): Promise<number> {
  const runs = await prisma.agentRun.findMany({
    where: { status: 'WAITING_FOR_RESPONSE', ...(opts.runIds ? { id: { in: opts.runIds } } : {}) },
    include: { communications: { include: { segment: true } } },
    take: 100,
  })

  let drafted = 0
  for (const run of runs) {
    const bySegment = new Map<string, typeof run.communications>()
    for (const c of run.communications) bySegment.set(c.segmentId, [...(bySegment.get(c.segmentId) ?? []), c])

    const targets = [...bySegment.values()]
      .map((comms) => followUpTarget(comms, now))
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
      .map((t) => run.communications.find((c) => c.id === t.id)!)
    if (targets.length === 0) continue

    // Claim the run first: only one cron tick (or overlapping invocation)
    // can move it out of WAITING_FOR_RESPONSE, so drafts are never doubled.
    const labels = targets.map((t) => segmentLabel(t.segment))
    const claim = await prisma.agentRun.updateMany({
      where: { id: run.id, status: 'WAITING_FOR_RESPONSE' },
      data: {
        status: 'AWAITING_APPROVAL',
        summary: `No reply yet from ${labels.join(' or ')}'s provider — Maestravl drafted a follow-up and is waiting for your OK to send it.`,
      },
    })
    if (claim.count === 0) continue

    for (const original of targets) {
      if (!original.contactId) continue
      const label = segmentLabel(original.segment)
      const message = composeFollowUp({
        originalSubject: original.subject,
        originalBody: original.content,
        sentAt: original.sentAt!,
        timezone: original.segment.timezone,
      })
      const followUp = await prisma.communication.create({
        data: {
          agentRunId: run.id,
          segmentId: original.segmentId,
          contactId: original.contactId,
          direction: 'OUTBOUND',
          channel: original.channel,
          subject: message.subject,
          content: message.body,
          status: 'DRAFTED',
        },
      })
      await prisma.agentAction.create({
        data: {
          agentRunId: run.id,
          segmentId: original.segmentId,
          type: 'CONTACT_PROVIDER',
          riskLevel: 'LOW',
          status: 'REQUIRES_APPROVAL',
          description: `No reply from ${label}'s provider after ${Math.round(FOLLOW_UP_AFTER_MS / 3_600_000)} hours — drafted a follow-up, waiting for your OK before sending.`,
          detail: JSON.stringify({ communicationId: followUp.id, requestedTime: null, reasonText: '', label, followUpOf: original.id }),
        },
      })
      drafted++
    }
  }
  return drafted
}

/**
 * Called when a provider replies: any follow-up still waiting on the
 * passenger's OK for that segment is moot, so it's withdrawn (SKIPPED)
 * rather than left for them to send by mistake.
 */
export async function withdrawPendingFollowUps(agentRunId: string, segmentId: string): Promise<void> {
  await prisma.agentAction.updateMany({
    where: { agentRunId, segmentId, type: 'CONTACT_PROVIDER', status: 'REQUIRES_APPROVAL', detail: { contains: '"followUpOf"' } },
    data: { status: 'SKIPPED' },
  })
}

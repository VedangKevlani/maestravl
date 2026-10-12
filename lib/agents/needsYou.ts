// The dashboard's "Needs you" inbox — every recovery run, across all of a
// passenger's trips, that cannot move forward without them, with what they
// need to decide on the spot. Deterministic: a status filter and a join,
// no AI. Replaces the dashboard's old single-line banner, which only ever
// named the *first* flagged trip and never said what was being asked.
//
// - AWAITING_APPROVAL: a provider contact waiting on their OK (with the
//   exact draft — lib/agents/pendingApprovals.ts)
// - RESCHEDULING: a provider replied yes; confirm the new time
// - ACTION_REQUIRED: something Maestravl couldn't finish on its own
import { prisma } from '@/lib/db'
import { STATUS_COPY } from './statusCopy'
import { snippetOf } from './replyText'
import { pendingContactForSegment, loadPendingApprovals, type PendingContactApproval } from './pendingApprovals'
import { activitySegmentLabel } from '@/lib/trips/activityFeed'
import { formatFriendlyTime, resolveSegmentZones } from '@/lib/dateFormat'

export const NEEDS_YOU_STATUSES = ['AWAITING_APPROVAL', 'RESCHEDULING', 'ACTION_REQUIRED'] as const

export interface NeedsYouItem {
  runId: string
  tripId: string
  tripTitle: string
  /** Segment the disruption was detected on — the anchor for "Open trip". */
  segmentId: string
  segmentLabel: string
  status: string
  headline: string
  summary: string | null
  updatedAt: string
  approvals: (PendingContactApproval & { segmentLabel: string })[]
  /** RESCHEDULING only — exactly what confirming will change. */
  reschedules: { segmentLabel: string; newTime: string }[]
  latestReply: { segmentLabel: string; snippet: string } | null
}

export async function loadNeedsYou(userId: string): Promise<NeedsYouItem[]> {
  const runs = await prisma.agentRun.findMany({
    where: { trip: { userId }, status: { in: [...NEEDS_YOU_STATUSES] } },
    orderBy: { updatedAt: 'desc' },
    take: 25,
    include: {
      trip: { select: { id: true, title: true } },
      disruption: { include: { segment: true } },
      actions: { select: { segmentId: true, type: true, status: true, detail: true, createdAt: true } },
      rescheduleRequests: { where: { status: 'REQUESTED' }, include: { segment: true } },
      alternatives: { where: { selected: true } },
      communications: {
        where: { direction: 'INBOUND' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { segment: true },
      },
    },
  })

  // Only the run's touched segments can have a pending contact.
  const pendingBySegment = runs.flatMap((run) => {
    if (run.status !== 'AWAITING_APPROVAL') return []
    const segmentIds = new Set<string>([run.disruption.segmentId])
    for (const a of run.actions) if (a.segmentId) segmentIds.add(a.segmentId)
    return [...segmentIds]
      .map((segmentId) => ({ runId: run.id, pending: pendingContactForSegment(run.actions, segmentId) }))
      .filter((p): p is { runId: string; pending: NonNullable<typeof p.pending> } => Boolean(p.pending))
  })
  const approvalsById = await loadPendingApprovals(pendingBySegment.map((p) => p.pending))
  const approvalSegmentIds = [...new Set([...approvalsById.values()].map((a) => a.segmentId))]
  const approvalSegments = approvalSegmentIds.length
    ? await prisma.segment.findMany({ where: { id: { in: approvalSegmentIds } } })
    : []
  const labelBySegment = new Map(approvalSegments.map((s) => [s.id, activitySegmentLabel(s)]))

  return runs.map((run) => {
    const approvals = pendingBySegment
      .filter((p) => p.runId === run.id)
      .map((p) => approvalsById.get(p.pending.communicationId))
      .filter((a): a is PendingContactApproval => Boolean(a))
      .map((a) => ({ ...a, segmentLabel: labelBySegment.get(a.segmentId) ?? 'A segment' }))

    const reschedules =
      run.status === 'RESCHEDULING'
        ? run.rescheduleRequests.map((r) => {
            // Same rule confirmReschedule.ts applies: a reply-selected
            // alternative wins over the originally requested time.
            const selected = run.alternatives.find((alt) => alt.segmentId === r.segmentId)
            const time = selected?.proposedTime ?? r.requestedTime
            return { segmentLabel: activitySegmentLabel(r.segment), newTime: formatFriendlyTime(time, resolveSegmentZones(r.segment).departure) }
          })
        : []

    const reply = run.communications[0]
    return {
      runId: run.id,
      tripId: run.trip.id,
      tripTitle: run.trip.title,
      segmentId: run.disruption.segmentId,
      segmentLabel: activitySegmentLabel(run.disruption.segment),
      status: run.status,
      headline: STATUS_COPY[run.status]?.headline ?? run.status,
      summary: run.summary,
      updatedAt: run.updatedAt.toISOString(),
      approvals,
      reschedules,
      latestReply: reply ? { segmentLabel: activitySegmentLabel(reply.segment), snippet: snippetOf(reply.content) } : null,
    }
  })
}

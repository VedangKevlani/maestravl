// The trip as every trip view renders it — the timeline page
// (app/(app)/trips/[id]/page.tsx) and the map view
// (app/(app)/trips/[id]/map/page.tsx). Extracted from the trip page so the
// two can never disagree about a segment's recovery state, its pending
// approval, or its monitoring status. Moved verbatim; see the comments
// inline for why each part works the way it does.
import { prisma } from '@/lib/db'
import { isTerminalRunStatus } from '@/lib/constants'
import { pendingContactForSegment, loadPendingApprovals } from '@/lib/agents/pendingApprovals'
import type { ActiveRunDTO, SegmentDTO, TripDTO } from '@/app/components/types'

/** Null when the trip doesn't exist or isn't this user's — callers 404. */
export async function loadTripView(tripId: string, userId: string): Promise<{ dto: TripDTO; homeTimezone: string | null } | null> {
  const [trip, user, tripAgentRuns] = await Promise.all([
    prisma.trip.findFirst({
      where: { id: tripId, userId },
      include: {
        passengers: true,
        segments: {
          orderBy: { order: 'asc' },
          include: { monitoring: true, passengerLinks: true },
        },
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { homeTimezone: true } }),
    // A run's recovery work often touches segments other than the one that
    // was originally disrupted (the connecting flight, the hotel it's now
    // contacting on the passenger's behalf) — see AgentAction.segmentId and
    // RescheduleRequest.segmentId below. Fetched flat per-trip (rather than
    // nested under each segment's own `disruptions`, which only ever points
    // at the segment that was disrupted) so pickActiveRun can attribute a
    // run to every segment it actually touches, not just the origin one.
    // Found via live testing 2026-08-12/13: the recovery ribbon never
    // appeared on a downstream segment being contacted on the passenger's
    // behalf, only on the one that triggered the run.
    prisma.agentRun.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        disruption: { select: { segmentId: true } },
        actions: { select: { segmentId: true, type: true, status: true, detail: true, createdAt: true } },
        rescheduleRequests: { where: { status: 'REQUESTED' }, select: { segmentId: true } },
      },
    }),
  ])
  if (!trip) return null

  /** Every segment id a run's recovery work has touched — the segment it was detected on, plus any it logged an action or reschedule request against. */
  function touchedSegmentIds(run: (typeof tripAgentRuns)[number]): Set<string> {
    const ids = new Set<string>()
    if (run.disruption.segmentId) ids.add(run.disruption.segmentId)
    for (const a of run.actions) if (a.segmentId) ids.add(a.segmentId)
    for (const r of run.rescheduleRequests) ids.add(r.segmentId)
    return ids
  }

  // Contacts waiting on the passenger's OK, with the full draft and any
  // other addresses on file — see lib/agents/pendingApprovals.ts (shared
  // with the dashboard's "Needs you" inbox).
  const pendingContacts = tripAgentRuns
    .filter((r) => r.status === 'AWAITING_APPROVAL')
    .flatMap((r) => [...touchedSegmentIds(r)].map((segId) => pendingContactForSegment(r.actions, segId)))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
  const pendingApprovalById = await loadPendingApprovals(pendingContacts)

  const dto: TripDTO = {
    id: trip.id,
    title: trip.title,
    status: trip.status,
    passengers: trip.passengers.map((p) => ({ id: p.id, name: p.name, isPrimary: p.isPrimary, email: p.email, phone: p.phone, emergencyContact: p.emergencyContact })),
    segments: trip.segments.map((s): SegmentDTO => {
      // Same "prefer the still-open run over the most recently resolved
      // one" rule the old TripRecoveryStatus.tsx banner used — reused here
      // via isTerminalRunStatus rather than redefined. candidateRuns now
      // includes any run that has touched this segment at all (see
      // touchedSegmentIds above), not just the one it was originally
      // disrupted on.
      const candidateRuns = tripAgentRuns.filter((r) => touchedSegmentIds(r).has(s.id))
      const activeRunRow = candidateRuns.find((r) => !isTerminalRunStatus(r.status)) ?? candidateRuns[0] ?? null

      const pending = activeRunRow?.status === 'AWAITING_APPROVAL' ? pendingContactForSegment(activeRunRow.actions, s.id) : null
      const pendingContactApproval = pending ? pendingApprovalById.get(pending.communicationId) ?? null : null

      const activeRun: ActiveRunDTO | null = activeRunRow
        ? {
            id: activeRunRow.id,
            status: activeRunRow.status,
            summary: activeRunRow.summary,
            pendingRescheduleCount: activeRunRow.rescheduleRequests.filter((r) => r.segmentId === s.id).length,
            pendingContactApproval,
          }
        : null

      return {
        id: s.id,
        order: s.order,
        transportType: s.transportType,
        status: s.status,
        provider: s.provider,
        identifier: s.identifier,
        confirmationNumber: s.confirmationNumber,
        ticketNumber: s.ticketNumber,
        departureLocation: s.departureLocation,
        departureLocationCode: s.departureLocationCode,
        departureTerminal: s.departureTerminal,
        departureGate: s.departureGate,
        departureTime: s.departureTime ? s.departureTime.toISOString() : null,
        arrivalLocation: s.arrivalLocation,
        arrivalLocationCode: s.arrivalLocationCode,
        arrivalTerminal: s.arrivalTerminal,
        arrivalTime: s.arrivalTime ? s.arrivalTime.toISOString() : null,
        timezone: s.timezone,
        seat: s.seat,
        cabin: s.cabin,
        travelClass: s.travelClass,
        currency: s.currency,
        price: s.price,
        baggageInfo: s.baggageInfo,
        notes: s.notes,
        confidenceScores: s.confidenceScores,
        passengerIds: s.passengerLinks.map((l) => l.passengerId),
        monitoring: s.monitoring
          ? {
              status: s.monitoring.status,
              apiProvider: s.monitoring.apiProvider,
              lastCheckedAt: s.monitoring.lastCheckedAt ? s.monitoring.lastCheckedAt.toISOString() : null,
              lastKnownData: s.monitoring.lastKnownData,
            }
          : null,
        activeRun,
      }
    }),
  }

  return { dto, homeTimezone: user?.homeTimezone ?? null }
}

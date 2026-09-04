import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isTerminalRunStatus } from '@/lib/constants'
import TripActivityTabs, { type ActivityItemDTO } from '../../../components/TripActivityTabs'
import UploadDropzone from '../../../components/UploadDropzone'
import TripHeader from '../../../components/TripHeader'
import TripAddSegmentClient from '../../../components/TripAddSegmentClient'
import VoiceWidget from '../../../components/VoiceWidget'
import type { ActiveRunDTO, SegmentDTO, TripDTO } from '../../../components/types'

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const userId = session!.user.id

  const [trip, user, disruptions, tripAgentRuns] = await Promise.all([
    prisma.trip.findFirst({
      where: { id, userId },
      include: {
        passengers: true,
        segments: {
          orderBy: { order: 'asc' },
          include: { monitoring: true, passengerLinks: true },
        },
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { homeTimezone: true } }),
    // Full activity history across every segment, for the "Trip Updates" tab.
    // Kept separate from the per-segment buffer above (which is capped at 3
    // for the boarding pass) so this tab isn't limited by that cap.
    prisma.disruption.findMany({
      where: { tripId: id },
      orderBy: { detectedAt: 'desc' },
      take: 50,
      include: {
        segment: { select: { identifier: true, provider: true, transportType: true } },
        agentRuns: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true, summary: true, createdAt: true },
        },
      },
    }),
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
      where: { tripId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        disruption: { select: { segmentId: true } },
        actions: { select: { segmentId: true, type: true, status: true, detail: true, createdAt: true } },
        rescheduleRequests: { where: { status: 'REQUESTED' }, select: { segmentId: true } },
      },
    }),
  ])
  if (!trip) notFound()

  /** Every segment id a run's recovery work has touched — the segment it was detected on, plus any it logged an action or reschedule request against. */
  function touchedSegmentIds(run: (typeof tripAgentRuns)[number]): Set<string> {
    const ids = new Set<string>()
    if (run.disruption.segmentId) ids.add(run.disruption.segmentId)
    for (const a of run.actions) if (a.segmentId) ids.add(a.segmentId)
    for (const r of run.rescheduleRequests) ids.add(r.segmentId)
    return ids
  }

  /**
   * The most recent CONTACT_PROVIDER action per segment, still sitting at
   * REQUIRES_APPROVAL — lib/agents/orchestrator.ts's draftContactRequest
   * writes exactly this shape into `detail` when it finds a contact but
   * stops short of emailing it, waiting on the passenger's own OK first.
   */
  function pendingContactCommunicationId(run: (typeof tripAgentRuns)[number], segmentId: string): string | null {
    const candidates = run.actions
      .filter((a) => a.segmentId === segmentId && a.type === 'CONTACT_PROVIDER')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    const latest = candidates[0]
    if (!latest || latest.status !== 'REQUIRES_APPROVAL' || !latest.detail) return null
    try {
      const parsed = JSON.parse(latest.detail) as { communicationId?: string }
      return parsed.communicationId ?? null
    } catch {
      return null
    }
  }

  const pendingCommunicationIds = tripAgentRuns
    .filter((r) => r.status === 'AWAITING_APPROVAL')
    .flatMap((r) => [...touchedSegmentIds(r)].map((segId) => pendingContactCommunicationId(r, segId)))
    .filter((commId): commId is string => Boolean(commId))

  const pendingCommunications = pendingCommunicationIds.length
    ? await prisma.communication.findMany({
        where: { id: { in: pendingCommunicationIds } },
        include: { contact: true },
      })
    : []
  const pendingCommunicationById = new Map(pendingCommunications.map((c) => [c.id, c]))

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

      const pendingCommId = activeRunRow?.status === 'AWAITING_APPROVAL' ? pendingContactCommunicationId(activeRunRow, s.id) : null
      const pendingComm = pendingCommId ? pendingCommunicationById.get(pendingCommId) : null
      const pendingContactApproval =
        pendingComm && pendingComm.contact
          ? {
              communicationId: pendingComm.id,
              contactValue: pendingComm.contact.value,
              channel: pendingComm.contact.channel,
              confidence: pendingComm.contact.confidence,
              source: pendingComm.contact.source,
            }
          : null

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

  // Flatten disruptions + their agent runs into one feed, newest first —
  // this is the data behind the "Trip Updates" tab. Each disruption is a
  // detected status change; each agent run under it is a step the recovery
  // agent took while working the disruption.
  const activity: ActivityItemDTO[] = disruptions
    .flatMap((d) => {
      const segmentLabel = d.segment.identifier || d.segment.provider || d.segment.transportType
      const items: ActivityItemDTO[] = [
        {
          id: d.id,
          segmentId: d.segmentId,
          segmentLabel,
          detectedAt: d.detectedAt.toISOString(),
          kind: 'status_change',
          previousStatus: d.previousStatus,
          newStatus: d.newStatus,
        },
      ]
      for (const run of d.agentRuns) {
        items.push({
          id: run.id,
          segmentId: d.segmentId,
          segmentLabel,
          detectedAt: run.createdAt.toISOString(),
          kind: 'agent_update',
          agentStatus: run.status,
          summary: run.summary,
        })
      }
      return items
    })
    .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())

  // Segments actively being watched by the monitoring service — surfaced
  // in TripHeader's "Monitoring N Segments" pill.

  return (
    <div>
      <TripHeader trip={dto} homeTimezone={user?.homeTimezone ?? null} />

      <TripAddSegmentClient
        segments={dto.segments}
        passengers={dto.passengers}
        tripId={dto.id}
      />

      <div data-tour="upload-more">
        <UploadDropzone tripId={dto.id} variant="mini" />
      </div>

      <section className="mt-8">
        {/* TripActivityTabs reads ?tab=/&segment= via useSearchParams (the
            BoardingPass "View full history" link lands here) — wrapped in
            Suspense to match the pattern used on the auth pages, so this
            doesn't force a client-side bailout during the build's static
            analysis of this route. */}
        <Suspense fallback={null}>
          <TripActivityTabs
            tripId={dto.id}
            tripTitle={dto.title}
            segments={dto.segments}
            passengers={dto.passengers}
            homeTimezone={user?.homeTimezone ?? null}
            activity={activity}
          />
        </Suspense>
      </section>

      <VoiceWidget tripId={dto.id} />
    </div>
  )
}

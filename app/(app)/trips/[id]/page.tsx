import { notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isTerminalRunStatus } from '@/lib/constants'
import Timeline from '../../../components/Timeline'
import TransportTypeForm from '../../../components/TransportTypeForm'
import UploadDropzone from '../../../components/UploadDropzone'
import TripHeader from '../../../components/TripHeader'
import VoiceWidget from '../../../components/VoiceWidget'
import HomeTimezoneBadge from '../../../components/HomeTimezoneBadge'
import type { ActiveRunDTO, SegmentDTO, TripDTO } from '../../../components/types'

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const userId = session!.user.id

  const [trip, user] = await Promise.all([
    prisma.trip.findFirst({
      where: { id, userId },
      include: {
        passengers: true,
        segments: {
          orderBy: { order: 'asc' },
          include: {
            monitoring: true,
            passengerLinks: true,
            // Small buffer of recent disruptions/runs per segment so the
            // boarding pass can show live recovery status inline — the
            // page's own query is the only data source it needs (no
            // separate polling endpoint). See pickActiveRun below for how
            // "active" is chosen when more than one recent run exists.
            disruptions: {
              orderBy: { detectedAt: 'desc' },
              take: 3,
              include: {
                agentRuns: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  include: { rescheduleRequests: { where: { status: 'REQUESTED' } } },
                },
              },
            },
          },
        },
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { homeTimezone: true } }),
  ])
  if (!trip) notFound()

  const dto: TripDTO = {
    id: trip.id,
    title: trip.title,
    status: trip.status,
    passengers: trip.passengers.map((p) => ({ id: p.id, name: p.name, isPrimary: p.isPrimary, email: p.email, phone: p.phone })),
    segments: trip.segments.map((s): SegmentDTO => {
      // Same "prefer the still-open run over the most recently resolved
      // one" rule the old TripRecoveryStatus.tsx banner used — reused here
      // via isTerminalRunStatus rather than redefined.
      const candidateRuns = s.disruptions.flatMap((d) => d.agentRuns)
      const activeRunRow = candidateRuns.find((r) => !isTerminalRunStatus(r.status)) ?? candidateRuns[0] ?? null
      const activeRun: ActiveRunDTO | null = activeRunRow
        ? {
            id: activeRunRow.id,
            status: activeRunRow.status,
            summary: activeRunRow.summary,
            pendingRescheduleCount: activeRunRow.rescheduleRequests.length,
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

  return (
    <div>
      <TripHeader trip={dto} />

      <div className="mt-3">
        <HomeTimezoneBadge initialHomeTimezone={user?.homeTimezone ?? null} />
      </div>

      <section className="mt-8">
        <p className="text-label text-white/40 mb-3">timeline</p>
        <Timeline tripId={dto.id} segments={dto.segments} passengers={dto.passengers} homeTimezone={user?.homeTimezone ?? null} />
      </section>

      <section className="mt-10">
        <p className="text-label text-white/40 mb-3">add a segment</p>
        <TransportTypeForm tripId={dto.id} />
      </section>

      <section className="mt-10 mb-10">
        <p className="text-label text-white/40 mb-3">import another document</p>
        <UploadDropzone tripId={dto.id} />
      </section>

      <VoiceWidget tripId={dto.id} />
    </div>
  )
}

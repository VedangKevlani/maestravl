import { notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import Timeline from '../../../components/Timeline'
import TransportTypeForm from '../../../components/TransportTypeForm'
import UploadDropzone from '../../../components/UploadDropzone'
import TripHeader from '../../../components/TripHeader'
import TripRecoveryStatus from '../../../components/TripRecoveryStatus'
import VoiceWidget from '../../../components/VoiceWidget'
import type { SegmentDTO, TripDTO } from '../../../components/types'

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const userId = session!.user.id

  const trip = await prisma.trip.findFirst({
    where: { id, userId },
    include: {
      passengers: true,
      segments: { orderBy: { order: 'asc' }, include: { monitoring: true, passengerLinks: true } },
    },
  })
  if (!trip) notFound()

  const dto: TripDTO = {
    id: trip.id,
    title: trip.title,
    status: trip.status,
    passengers: trip.passengers.map((p) => ({ id: p.id, name: p.name, isPrimary: p.isPrimary, email: p.email, phone: p.phone })),
    segments: trip.segments.map((s): SegmentDTO => ({
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
    })),
  }

  return (
    <div>
      <TripHeader trip={dto} />

      <div className="mt-8">
        <TripRecoveryStatus tripId={dto.id} />
      </div>

      <section className="mt-2">
        <p className="text-label text-white/40 mb-3">timeline</p>
        <Timeline tripId={dto.id} segments={dto.segments} passengers={dto.passengers} />
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

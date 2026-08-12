import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import TripCardMenu from '../../components/TripCardMenu'
import { formatFriendlyTime, resolveSegmentZones } from '@/lib/dateFormat'

function formatDate(d: Date | null, timezone: string | null) {
  if (!d) return null
  return formatFriendlyTime(d, timezone)
}

type TripWithRelations = Awaited<ReturnType<typeof getTrips>>[number]

async function getTrips(userId: string) {
  return prisma.trip.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      passengers: true,
      segments: { orderBy: { order: 'asc' }, include: { monitoring: true } },
    },
  })
}

function TripCard({ trip, muted }: { trip: TripWithRelations; muted?: boolean }) {
  const nextSegment = trip.segments.find((s) => s.departureTime && s.departureTime > new Date()) ?? trip.segments[0]
  const activeMonitoring = trip.segments.filter((s) => s.monitoring?.status === 'ACTIVE').length

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="glass-card p-6 block hover:bg-white/[0.06] transition-colors"
      style={muted ? { opacity: 0.7 } : undefined}
    >
      <div className="flex items-start justify-between mb-4 gap-2">
        <h2 className="text-editorial text-white font-semibold min-w-0 truncate" style={{ fontSize: '1.1rem' }}>{trip.title}</h2>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-label px-2.5 py-1 rounded-full whitespace-nowrap"
            style={{
              background: muted ? 'rgba(255,255,255,0.08)' : 'rgba(82,183,136,0.12)',
              color: muted ? 'rgba(255,255,255,0.5)' : '#52b788',
              fontSize: '0.6rem',
            }}
          >
            {trip.status}
          </span>
          <TripCardMenu tripId={trip.id} tripTitle={trip.title} />
        </div>
      </div>
      <p className="text-editorial text-white/50 mb-1" style={{ fontSize: '0.85rem' }}>
        {trip.segments.length} segment{trip.segments.length === 1 ? '' : 's'} · {trip.passengers.length} passenger{trip.passengers.length === 1 ? '' : 's'}
      </p>
      {nextSegment?.departureTime && (
        <p className="text-editorial text-white/40" style={{ fontSize: '0.8rem' }}>
          {muted ? 'Last' : 'Next'}: {nextSegment.identifier || nextSegment.transportType} · {formatDate(nextSegment.departureTime, resolveSegmentZones(nextSegment).departure)}
        </p>
      )}
      {!muted && (
        <p className="text-label text-white/25 mt-3" style={{ fontSize: '0.65rem' }}>
          {activeMonitoring > 0 ? `${activeMonitoring} segment${activeMonitoring === 1 ? '' : 's'} actively monitored` : 'Monitoring not yet connected'}
        </p>
      )}
    </Link>
  )
}

export default async function DashboardPage() {
  const session = await auth()
  const userId = session!.user.id

  const trips = await getTrips(userId)
  // Archived = COMPLETED trips (a segment arriving auto-completes its trip
  // — see lib/monitoring/service.ts). Kept out of the main grid so a
  // finished trip doesn't clutter the view of what's actually upcoming.
  const activeTrips = trips.filter((t) => t.status !== 'COMPLETED')
  const archivedTrips = trips.filter((t) => t.status === 'COMPLETED')

  return (
    <div>
      <div className="flex items-center justify-between mb-10">
        <div>
          <p className="text-label text-white/40 mb-2">your trips</p>
          <h1 className="text-display text-white" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)' }}>Dashboard</h1>
        </div>
        <Link
          href="/trips/new"
          className="px-6 py-3 rounded-full text-editorial font-medium whitespace-nowrap"
          style={{ background: 'var(--warm-white)', color: 'var(--charcoal)' }}
        >
          + New Trip
        </Link>
      </div>

      {trips.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-editorial text-white/50 mb-6">No trips yet. Import an itinerary or build one manually.</p>
          <Link href="/trips/new" className="text-editorial text-white underline">Get started →</Link>
        </div>
      ) : (
        <>
          {activeTrips.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <p className="text-editorial text-white/50 mb-6">No upcoming trips — everything you have is archived below.</p>
              <Link href="/trips/new" className="text-editorial text-white underline">Plan a new trip →</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {activeTrips.map((trip) => <TripCard key={trip.id} trip={trip} />)}
            </div>
          )}

          {archivedTrips.length > 0 && (
            <details className="mt-10">
              <summary className="text-label text-white/40 hover:text-white/70 cursor-pointer" style={{ fontSize: '0.7rem' }}>
                Archived trips ({archivedTrips.length})
              </summary>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
                {archivedTrips.map((trip) => <TripCard key={trip.id} trip={trip} muted />)}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  )
}

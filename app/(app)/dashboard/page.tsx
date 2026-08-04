import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

function formatDate(d: Date | null) {
  if (!d) return null
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d)
}

export default async function DashboardPage() {
  const session = await auth()
  const userId = session!.user.id

  const trips = await prisma.trip.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      passengers: true,
      segments: { orderBy: { order: 'asc' }, include: { monitoring: true } },
    },
  })

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {trips.map((trip) => {
            const nextSegment = trip.segments.find((s) => s.departureTime && s.departureTime > new Date()) ?? trip.segments[0]
            const activeMonitoring = trip.segments.filter((s) => s.monitoring?.status === 'ACTIVE').length
            return (
              <Link key={trip.id} href={`/trips/${trip.id}`} className="glass-card p-6 block hover:bg-white/[0.06] transition-colors">
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-editorial text-white font-semibold" style={{ fontSize: '1.1rem' }}>{trip.title}</h2>
                  <span className="text-label px-2.5 py-1 rounded-full" style={{ background: 'rgba(82,183,136,0.12)', color: '#52b788', fontSize: '0.6rem' }}>
                    {trip.status}
                  </span>
                </div>
                <p className="text-editorial text-white/50 mb-1" style={{ fontSize: '0.85rem' }}>
                  {trip.segments.length} segment{trip.segments.length === 1 ? '' : 's'} · {trip.passengers.length} passenger{trip.passengers.length === 1 ? '' : 's'}
                </p>
                {nextSegment?.departureTime && (
                  <p className="text-editorial text-white/40" style={{ fontSize: '0.8rem' }}>
                    Next: {nextSegment.identifier || nextSegment.transportType} · {formatDate(nextSegment.departureTime)}
                  </p>
                )}
                <p className="text-label text-white/25 mt-3" style={{ fontSize: '0.65rem' }}>
                  {activeMonitoring > 0 ? `${activeMonitoring} segment${activeMonitoring === 1 ? '' : 's'} actively monitored` : 'Monitoring not yet connected'}
                </p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

import Link from 'next/link'
import { Plus, Calendar, User, Route, Eye, Compass, Clock } from 'lucide-react'
import { requirePageUserId } from '@/lib/pageAuth'
import { prisma } from '@/lib/db'
import DashTripCardMenu from '../../components/DashTripCardMenu'
import DashboardTabs from '../../components/DashboardTabs'
import NeedsYouInbox from '../../components/NeedsYouInbox'
import { loadNeedsYou } from '@/lib/agents/needsYou'
import styles from '../../styles/dashboard.module.css'

function formatDayMonth(d: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d)
}

function tripDateRange(trip: { segments: { departureTime: Date | null; arrivalTime: Date | null }[] }) {
  // Trip has no startDate/endDate of its own — derive the range from the
  // earliest departure and latest arrival across its segments instead.
  const times = trip.segments.flatMap((s) => [s.departureTime, s.arrivalTime]).filter((d): d is Date => d !== null)
  if (times.length === 0) return null
  const start = new Date(Math.min(...times.map((d) => d.getTime())))
  const end = new Date(Math.max(...times.map((d) => d.getTime())))
  return start.getTime() === end.getTime()
    ? formatDayMonth(start)
    : `${formatDayMonth(start)} – ${formatDayMonth(end)}`
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

// Mirrors new-frontend-src/dashboard/dashboard.js's tripCardHTML(): name +
// date range up top, passenger/segment counts, monitored-segment count,
// and a "Manage" footer button — no status badge and no "next departure"
// line on the dashboard card (that detail lives on the trip page itself).
function TripCard({ trip }: { trip: TripWithRelations }) {
  const dateRange = tripDateRange(trip)
  const monitoredCount = trip.segments.filter((s) => s.monitoring?.status === 'ACTIVE').length

  return (
    <Link href={`/trips/${trip.id}`} className={styles.tripCard}>
      <div className={styles.tripCardTop}>
        <div>
          <div className={styles.tripCardName}>{trip.title}</div>
          {dateRange && (
            <div className={styles.tripCardDates}>
              <Calendar size={13} strokeWidth={2} />
              {dateRange}
            </div>
          )}
        </div>
        <DashTripCardMenu tripId={trip.id} tripTitle={trip.title} />
      </div>

      <div className={styles.tripCardRow}>
        <span data-tip="Number of travellers on this trip">
          <User size={14} strokeWidth={2} />
          <b className={styles.tripCardNum}>{trip.passengers.length}</b> Passengers
        </span>
        <span className={styles.tripCardSep}>|</span>
        <span data-tip="Flights, hotels, and other legs in this trip's timeline">
          <Route size={14} strokeWidth={2} />
          <b className={styles.tripCardNum}>{trip.segments.length}</b> Trip Segments
        </span>
      </div>
      <div className={styles.tripCardRow}>
        <span data-tip="Maestro watches these segments for delays, cancellations, and changes — and alerts you automatically">
          <Eye size={14} strokeWidth={2} />
          <b className={styles.tripCardNum}>{monitoredCount}</b> Segments Monitored By Maestro
        </span>
      </div>

      <div className={styles.tripCardFooter}>
        <span className={styles.manageBtn}>Manage</span>
      </div>
    </Link>
  )
}

function TripPanel({ trips, emptyIcon, emptyText }: { trips: TripWithRelations[]; emptyIcon: React.ReactNode; emptyText: string }) {
  if (trips.length === 0) {
    return (
      <div className={styles.emptyState}>
        {emptyIcon}
        <p>{emptyText}</p>
      </div>
    )
  }
  return (
    <div className={styles.tripGrid}>
      {trips.map((trip) => (
        <TripCard key={trip.id} trip={trip} />
      ))}
    </div>
  )
}

export default async function DashboardPage() {
  const userId = await requirePageUserId()

  const [trips, needsYou] = await Promise.all([getTrips(userId), loadNeedsYou(userId)])
  // Three sections mirror trip.status directly (set by lib/monitoring/service.ts):
  // ACTIVE = happening right now, UPCOMING = not started yet, COMPLETED/CANCELLED = done.
  const activeTrips = trips.filter((t) => t.status === 'ACTIVE')
  const upcomingTrips = trips.filter((t) => t.status === 'UPCOMING')
  const pastTrips = trips.filter((t) => t.status === 'COMPLETED' || t.status === 'CANCELLED')

  return (
    <div className={styles.dashWrap}>
      <div className={styles.dashTitleRow}>
        <h1 className={styles.dashTitle} data-tour="dashboard-heading">
          Dashboard
        </h1>
      </div>
      <hr style={{ marginBottom: 20, border: 'none', borderTop: '1.5px solid var(--border-soft)' }} />

      <div className={styles.newTripRow}>
        <Link href="/trips/new" data-tour="new-trip-button" className={styles.newTripBtn} data-tip="Start a new trip by importing an itinerary or building it manually">
          <Plus size={13} strokeWidth={2.5} /> New Trip
        </Link>
      </div>

      {/* Every decision waiting on the passenger, answerable right here —
          replaces a banner that only ever named the first flagged trip. */}
      <NeedsYouInbox items={needsYou} />

      <div className={styles.dashSectionTitle}>Active Trips</div>
      <TripPanel
        trips={activeTrips}
        emptyIcon={<Compass size={20} strokeWidth={1.75} />}
        emptyText="No active trips right now."
      />

      <DashboardTabs
        upcomingPanel={
          <TripPanel
            trips={upcomingTrips}
            emptyIcon={<Calendar size={20} strokeWidth={1.75} />}
            emptyText="No upcoming trips yet."
          />
        }
        pastPanel={
          <TripPanel
            trips={pastTrips}
            emptyIcon={<Clock size={20} strokeWidth={1.75} />}
            emptyText="No past trips yet. Trips move here once their end date has passed."
          />
        }
      />
    </div>
  )
}

'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileText, Pencil, Route, Eye, User } from 'lucide-react'
import Link from 'next/link'
import type { TripDTO, PassengerDTO } from './types'
import TripHeaderMenu from './TripHeaderMenu'
import HomeTimezoneBadge from './HomeTimezoneBadge'
import ManagePassengersModal from './ManagePassengersModal'
import EditPassengerModal from './EditPassengerModal'
import styles from '../styles/trip.module.css'

function formatMonthDay(d: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d).toUpperCase()
}
function formatMonthDayYear(d: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d).toUpperCase()
}

// Mirrors trip.html's #tripSub: "SEPT 1 – SEPT 15, 2026", derived the same
// way the dashboard card's date range is — earliest departure to latest
// arrival across segments, since Trip has no startDate/endDate of its own.
function tripDateRange(segments: TripDTO['segments']) {
  const times = segments
    .flatMap((s) => [s.departureTime, s.arrivalTime])
    .filter((d): d is string => d !== null)
    .map((d) => new Date(d))
  if (times.length === 0) return null
  const start = new Date(Math.min(...times.map((d) => d.getTime())))
  const end = new Date(Math.max(...times.map((d) => d.getTime())))
  return start.getTime() === end.getTime() ? formatMonthDayYear(start) : `${formatMonthDay(start)} – ${formatMonthDayYear(end)}`
}

function statusPillClass(status: string) {
  const s = status.toUpperCase()
  if (s === 'UPCOMING') return `${styles.tripStatusPill} ${styles.tripStatusPillUpcoming}`
  if (s === 'COMPLETED' || s === 'CANCELLED') return `${styles.tripStatusPill} ${styles.tripStatusPillPast}`
  return styles.tripStatusPill
}

export default function TripHeader({ trip, homeTimezone }: { trip: TripDTO; homeTimezone: string | null }) {
  const router = useRouter()

  // Modal State
  const [managePassengersOpen, setManagePassengersOpen] = useState(false)
  const [editPassengerModalOpen, setEditPassengerModalOpen] = useState(false)
  const [editingPassenger, setEditingPassenger] = useState<PassengerDTO | null>(null)

  // Title Editing State
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(trip.title)
  const [savingTitle, setSavingTitle] = useState(false)

  const monitoredCount = trip.segments.filter((s) => s.monitoring?.status === 'ACTIVE').length
  const dateRange = tripDateRange(trip.segments)

  async function saveTitle(e: React.FormEvent) {
    e.preventDefault()
    if (!editTitle.trim()) return
    setSavingTitle(true)
    await fetch(`/api/trips/${trip.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editTitle.trim() }),
    })
    setSavingTitle(false)
    setIsEditingTitle(false)
    router.refresh()
  }

  function handleOpenAddPassenger() {
    setEditingPassenger(null)
    setEditPassengerModalOpen(true)
  }

  function handleOpenEditPassenger(passengerId: string) {
    const p = trip.passengers.find((p) => p.id === passengerId)
    if (p) {
      setEditingPassenger(p)
      setEditPassengerModalOpen(true)
    }
  }

  return (
    <div data-tour="trip-header">
      <ManagePassengersModal
        tripId={trip.id}
        passengers={trip.passengers}
        open={managePassengersOpen}
        onClose={() => setManagePassengersOpen(false)}
        onAddPassenger={handleOpenAddPassenger}
        onEditPassenger={handleOpenEditPassenger}
      />
      <EditPassengerModal
        tripId={trip.id}
        passenger={editingPassenger}
        open={editPassengerModalOpen}
        onClose={() => setEditPassengerModalOpen(false)}
        isFirstPassenger={trip.passengers.length === 0}
      />

      <div className={styles.tripTitleRow}>
        <Link href="/dashboard" className={styles.backLink}>
          <ArrowLeft size={11} strokeWidth={2.5} /> Dashboard
        </Link>
        <div className={styles.tripTitleHead}>
          <div className={styles.tripTitleLine}>
            {isEditingTitle ? (
              <form onSubmit={saveTitle} className={styles.titleEditForm}>
                <input
                  autoFocus
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className={styles.titleInput}
                  placeholder="Trip title"
                />
                <button type="submit" disabled={savingTitle} className={styles.inlineFormAction}>
                  {savingTitle ? '…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(false)}
                  className={styles.inlineFormCancel}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className={styles.tripTitle}>{trip.title}</h1>
                <button
                  type="button"
                  onClick={() => {
                    setEditTitle(trip.title)
                    setIsEditingTitle(true)
                  }}
                  className={styles.titleEditBtn}
                  aria-label="Edit trip title"
                  title="Edit trip title"
                >
                  <Pencil size={14} strokeWidth={2} />
                </button>
              </div>
            )}
            {dateRange && (
              <>
                <span className={styles.tripTitleDot}>·</span>
                <div className={styles.tripSub}>{dateRange}</div>
              </>
            )}
          </div>
          <div className={styles.tripTitleActions}>
            <span className={statusPillClass(trip.status)}>{trip.status.toLowerCase()}</span>
            <a
              href={`/api/trips/${trip.id}/activity/pdf`}
              className={styles.activityLogLink}
              title="Download this trip's full recovery history as a PDF, for a support conversation"
            >
              <FileText size={13} strokeWidth={2} /> Activity log (PDF)
            </a>
            <TripHeaderMenu tripId={trip.id} tripTitle={trip.title} />
          </div>
        </div>
      </div>

      <div className={styles.pillRow} data-tour="home-timezone">
        <div className={styles.pill} data-tip="Total number of flights, hotels, and other legs in this trip's timeline">
          <Route size={17} strokeWidth={2} />
          <span className={styles.pillNum}>{trip.segments.length}</span> Trip Segments
        </div>
        <div className={styles.pill} data-tip="Maestro is actively watching these segments for delays, cancellations, and gate changes">
          <Eye size={17} strokeWidth={2} />
          Monitoring <span className={styles.pillNum}>{monitoredCount}</span> Segments
        </div>
        <div
          className={styles.pill}
          style={{ cursor: 'pointer' }}
          onClick={() => setManagePassengersOpen(true)}
          data-tip="Travellers linked to this trip — click to manage passengers"
        >
          <User size={17} strokeWidth={2} />
          <span className={styles.pillNum}>{trip.passengers.length}</span> Passengers
        </div>
        <div className={styles.pillSpacer}>
          <HomeTimezoneBadge initialHomeTimezone={homeTimezone} />
        </div>
      </div>

      <div className={styles.section} data-tour="add-passenger">
        <div className="flex items-center justify-between">
          <div className={styles.sectionTitle}>Passengers</div>
        </div>
        <hr className={styles.sectionHr} />
        
        <div className={styles.passengerRow}>
          {trip.passengers.map((p) => (
            <div key={p.id} className={styles.passengerCol}>
              {p.isPrimary && <span className={styles.primaryLabel}>PRIMARY</span>}
              <span data-tour="passenger-chip" className={styles.passengerPill}>
                <span title={[p.email, p.phone].filter(Boolean).join(' · ') || 'No email or phone on file — cannot be notified'}>
                  {p.name}
                  {!p.email && !p.phone && <span style={{ color: 'var(--faint)' }}> · no contact info</span>}
                </span>
                <button
                  type="button"
                  onClick={() => handleOpenEditPassenger(p.id)}
                  className={styles.passengerPillEdit}
                  aria-label="Edit passenger info"
                  title="Edit passenger"
                >
                  <Pencil size={11} strokeWidth={2} />
                </button>
              </span>
            </div>
          ))}
          
          <button type="button" onClick={() => setManagePassengersOpen(true)} className={styles.pillBtn}>
            + Edit Passengers
          </button>
        </div>
      </div>
    </div>
  )
}

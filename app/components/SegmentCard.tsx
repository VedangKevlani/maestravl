'use client'
import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRouter } from 'next/navigation'
import ConfidenceBadge from './ConfidenceBadge'
import SegmentEditForm from './SegmentEditForm'
import { TRANSPORT_ICONS, type PassengerDTO, type SegmentDTO } from './types'
import { formatMonitoringStatus } from '@/lib/monitoring/format'
import { toLocalInputValue } from './dateInput'
import { isUberConfigured, locationText, buildUberDeepLink, isPlausibleUberTrip } from '@/lib/uber'
import { getFieldProfile } from './segmentFieldProfiles'

const fieldClassSmall = 'glass-card px-2.5 py-1.5 text-editorial text-white bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40'

const CHECK_STATUS_STYLES: Record<string, { bg: string; fg: string }> = {
  ON_TIME: { bg: 'rgba(82,183,136,0.12)', fg: '#52b788' },
  ARRIVED: { bg: 'rgba(82,183,136,0.12)', fg: '#52b788' },
  BOARDING: { bg: 'rgba(74,160,216,0.12)', fg: '#4aa0d8' },
  DEPARTED: { bg: 'rgba(74,160,216,0.12)', fg: '#4aa0d8' },
  DELAYED: { bg: 'rgba(212,168,83,0.15)', fg: '#d4a853' },
  CANCELLED: { bg: 'rgba(229,72,77,0.12)', fg: '#e5484d' },
  UNKNOWN: { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.5)' },
}

function parseCheckStatus(lastKnownData: string | null): string | null {
  if (!lastKnownData) return null
  try {
    const parsed = JSON.parse(lastKnownData) as { status?: string }
    return parsed.status ?? null
  } catch {
    return null
  }
}

function formatDateTime(iso: string | null) {
  if (!iso) return null
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

const MONITORING_LABEL: Record<string, string> = {
  NOT_CONFIGURED: 'Monitoring not yet connected',
  ACTIVE: 'Actively monitored',
  PAUSED: 'Monitoring paused',
  ERROR: 'Monitoring error',
}

// "Not yet connected" implies live tracking is possible here and just
// isn't switched on — true for flights/trains/buses/ferries/taxis (see
// lib/monitoring/registry.ts), but for types with no adapter at all
// (hotel, restaurant, excursion, etc.) it's misleading: there's nothing to
// connect. `apiProvider` is only ever set when an adapter actually matched
// this segment's transport type (see initializeMonitoringForSegment), so
// null reliably distinguishes the two cases.
function monitoringLabel(monitoring: SegmentDTO['monitoring']): string {
  if (!monitoring || !monitoring.apiProvider) {
    return "No live tracking for this type — Maestravl still watches for it if an earlier segment on your trip is delayed."
  }
  return MONITORING_LABEL[monitoring.status] ?? 'Monitoring status unknown'
}

interface ReportResult {
  message?: string
  agentRun?: { status: string } | null
}

export default function SegmentCard({ segment, passengers, nextSegment }: { segment: SegmentDTO; passengers: PassengerDTO[]; nextSegment: SegmentDTO | null }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportNewTime, setReportNewTime] = useState(() => toLocalInputValue(segment.departureTime))
  const [reporting, setReporting] = useState(false)
  const [reportResult, setReportResult] = useState<ReportResult | null>(null)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: segment.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  let confidenceScores: Record<string, number> = {}
  try {
    confidenceScores = segment.confidenceScores ? JSON.parse(segment.confidenceScores) : {}
  } catch { /* ignore */ }
  const fieldsNeedingReview = Object.entries(confidenceScores).filter(([, v]) => v < 70)
  const checkStatus = parseCheckStatus(segment.monitoring?.lastKnownData ?? null)
  const linkedPassengers = passengers.filter((p) => segment.passengerIds.includes(p.id))

  // "Departure time" only makes sense for route-based segments — a hotel's
  // equivalent scheduled moment is check-in, a restaurant's is its
  // reservation time, etc. segmentFieldProfiles.ts already encodes this
  // per transport type for the add/edit forms; reuse it here rather than
  // hardcoding "departure" for every type (segment.departureTime is still
  // the underlying field being updated for all of them — HOTEL's
  // departureTimeLabel: 'Check-in' documents that it's the same column,
  // just a different real-world label).
  const reportTimeLabel = getFieldProfile(segment.transportType).departureTimeLabel
  const reportTimeLabelLower = reportTimeLabel.charAt(0).toLowerCase() + reportTimeLabel.slice(1)

  // A deep link into Uber's own app with pickup/dropoff prefilled — not a
  // real booking, Maestravl has no payment infrastructure and never touches
  // money here (see lib/uber.ts). Only offered when this segment is
  // actually disrupted, there's a real next segment with a resolvable
  // location to get to, AND the two ends are a realistic same-metro ride —
  // not a cross-state/cross-country hop nobody could actually take
  // (isPlausibleUberTrip requires both ends to resolve to known, nearby
  // airport codes; free-text-only locations can't be geo-checked, so they
  // don't get the link rather than risking a nonsense suggestion).
  const uberPickup = locationText(segment, 'arrival')
  const uberDropoff = nextSegment ? locationText(nextSegment, 'departure') : null
  const uberPlausible = isPlausibleUberTrip(segment.arrivalLocationCode, nextSegment?.departureLocationCode ?? null)
  const clientId = process.env.NEXT_PUBLIC_UBER_CLIENT_ID
  const uberHref =
    isUberConfigured() && clientId && (segment.status === 'DELAYED' || segment.status === 'CANCELLED') && uberPickup && uberDropoff && uberPlausible
      ? buildUberDeepLink({ clientId, pickup: uberPickup, dropoff: uberDropoff })
      : null

  async function handleDelete() {
    if (!confirm('Remove this segment from the trip?')) return
    setDeleting(true)
    await fetch(`/api/segments/${segment.id}`, { method: 'DELETE' })
    router.refresh()
  }

  async function handleCheckNow() {
    setChecking(true)
    await fetch(`/api/segments/${segment.id}/monitor`, { method: 'POST' })
    setChecking(false)
    router.refresh()
  }

  async function handleReport(status: 'DELAYED' | 'CANCELLED') {
    setReporting(true)
    setReportResult(null)
    const body: { status: string; newDepartureTime?: string } = { status }
    if (status === 'DELAYED') {
      const parsed = reportNewTime ? new Date(reportNewTime) : null
      if (!parsed || isNaN(parsed.getTime())) {
        setReporting(false)
        setReportResult({ message: 'Enter the new departure time first.' })
        return
      }
      body.newDepartureTime = parsed.toISOString()
    }
    const res = await fetch(`/api/segments/${segment.id}/report-disruption`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    setReporting(false)
    if (!res.ok) {
      setReportResult({ message: data.error || 'Could not report this — please try again.' })
      return
    }
    setReportResult(data)
    router.refresh()
  }

  if (editing) {
    return (
      <div ref={setNodeRef} style={style} className="glass-card p-5">
        <SegmentEditForm segment={segment} passengers={passengers} onDone={() => { setEditing(false); router.refresh() }} onCancel={() => setEditing(false)} />
      </div>
    )
  }

  return (
    <div ref={setNodeRef} style={style} className="glass-card p-5 flex gap-4">
      <button
        {...attributes} {...listeners}
        aria-label="Drag to reorder"
        className="text-white/25 hover:text-white/60 cursor-grab active:cursor-grabbing touch-none px-1 self-stretch flex items-center"
      >
        ⠿
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>{TRANSPORT_ICONS[segment.transportType] ?? '•'}</span>
            <p className="text-editorial text-white font-medium truncate">
              {segment.provider || segment.transportType} {segment.identifier ? `· ${segment.identifier}` : ''}
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button onClick={() => setEditing(true)} className="text-label text-white/40 hover:text-white/80" style={{ fontSize: '0.65rem' }}>Edit</button>
            <button onClick={handleDelete} disabled={deleting} className="text-label text-white/40 hover:text-red-400" style={{ fontSize: '0.65rem' }}>
              {deleting ? '…' : 'Remove'}
            </button>
          </div>
        </div>

        {(segment.departureLocation || segment.arrivalLocation) && (
          <p className="text-editorial text-white/60 mb-1" style={{ fontSize: '0.85rem' }}>
            {segment.departureLocation ?? '?'} {segment.departureLocationCode ? `(${segment.departureLocationCode})` : ''}
            {' → '}
            {segment.arrivalLocation ?? '?'} {segment.arrivalLocationCode ? `(${segment.arrivalLocationCode})` : ''}
          </p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-editorial text-white/40" style={{ fontSize: '0.78rem' }}>
          {segment.departureTime && <span>Departs {formatDateTime(segment.departureTime)}</span>}
          {segment.arrivalTime && <span>Arrives {formatDateTime(segment.arrivalTime)}</span>}
          {segment.seat && <span>Seat {segment.seat}</span>}
          {segment.confirmationNumber && <span>Conf. {segment.confirmationNumber}</span>}
        </div>

        {fieldsNeedingReview.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <span className="text-label text-white/30" style={{ fontSize: '0.6rem' }}>please confirm:</span>
            {fieldsNeedingReview.map(([field, score]) => (
              <span key={field} className="inline-flex items-center gap-1">
                <span className="text-label text-white/50" style={{ fontSize: '0.62rem' }}>{field}</span>
                <ConfidenceBadge confidence={score} />
              </span>
            ))}
          </div>
        )}

        <p className="text-label text-white/25 mt-3" style={{ fontSize: '0.6rem' }}>
          {linkedPassengers.length === 0
            ? 'No passengers linked — won\'t be notified of changes'
            : `Notifies: ${linkedPassengers.map((p) => p.email ? p.name : `${p.name} (no email)`).join(', ')}`}
        </p>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <p className="text-label text-white/20" style={{ fontSize: '0.6rem' }}>
            {monitoringLabel(segment.monitoring)}
            {segment.monitoring?.lastCheckedAt && ` · last checked ${formatDateTime(segment.monitoring.lastCheckedAt)}`}
          </p>
          {/* Only shown once a real adapter has actually run a check — a
              stub adapter (train/bus/etc.) always reports UNKNOWN even when
              "connected," and a pill sitting next to "not yet connected"
              text would otherwise imply more monitoring is happening than
              actually is. */}
          {checkStatus && segment.monitoring?.status === 'ACTIVE' && (
            <span
              className="text-label px-2 py-0.5 rounded-full"
              style={{ background: (CHECK_STATUS_STYLES[checkStatus] ?? CHECK_STATUS_STYLES.UNKNOWN).bg, color: (CHECK_STATUS_STYLES[checkStatus] ?? CHECK_STATUS_STYLES.UNKNOWN).fg, fontSize: '0.6rem' }}
            >
              {formatMonitoringStatus(checkStatus)}
            </span>
          )}
          {segment.monitoring?.status === 'ACTIVE' && (
            <button
              onClick={handleCheckNow}
              disabled={checking}
              className="text-label text-white/40 hover:text-white/80 disabled:opacity-50"
              style={{ fontSize: '0.6rem' }}
            >
              {checking ? 'Checking…' : 'Check now'}
            </button>
          )}
          <button
            onClick={() => { setReportOpen((v) => !v); setReportResult(null) }}
            className="text-label text-white/40 hover:text-white/80"
            style={{ fontSize: '0.6rem' }}
          >
            {reportOpen ? 'Cancel' : 'Report a delay'}
          </button>
          {uberHref && (
            <a
              href={uberHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-label text-white/40 hover:text-white/80"
              style={{ fontSize: '0.6rem' }}
            >
              Get an Uber there →
            </a>
          )}
        </div>

        {reportOpen && (
          <div className="glass-card p-3 mt-3 flex flex-col gap-2.5">
            <p className="text-label text-white/40" style={{ fontSize: '0.6rem' }}>
              Manually tell Maestravl this segment was delayed or cancelled — this is exactly what a real detected
              disruption triggers, so you can see (and get emailed about) the full recovery flow without waiting on
              live monitoring.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-editorial text-white/50" style={{ fontSize: '0.78rem' }}>New {reportTimeLabelLower}:</span>
              <input
                type="datetime-local"
                value={reportNewTime}
                onChange={(e) => setReportNewTime(e.target.value)}
                className={fieldClassSmall}
                aria-label={`New ${reportTimeLabelLower}`}
              />
              <button
                onClick={() => handleReport('DELAYED')}
                disabled={reporting}
                className="px-3 py-1.5 rounded-full text-label disabled:opacity-50"
                style={{ background: 'var(--warm-white)', color: 'var(--charcoal)', fontSize: '0.65rem' }}
              >
                {reporting ? 'Reporting…' : 'Report delay'}
              </button>
              <button
                onClick={() => handleReport('CANCELLED')}
                disabled={reporting}
                className="px-3 py-1.5 rounded-full text-label border border-white/20 text-white/70 disabled:opacity-50"
                style={{ fontSize: '0.65rem' }}
              >
                {reporting ? 'Reporting…' : 'Report cancelled'}
              </button>
            </div>

            {reportResult && (
              <p className="text-editorial text-white/60 border-t border-white/10 pt-2.5 mt-1" style={{ fontSize: '0.8rem' }}>
                {reportResult.message ?? 'Reported — see the status update at the top of the trip page.'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
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
import { formatFriendlyTime, resolveSegmentZones } from '@/lib/dateFormat'
import SegmentWorldClock from './SegmentWorldClock'
import { STATUS_COPY, toneOf } from '@/lib/agents/statusCopy'
import { isTerminalRunStatus } from '@/lib/constants'

const fieldClassSmall = 'glass-card px-2.5 py-1.5 text-editorial text-white bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40'

// Boarding-pass-style status pill — reflects the segment's own ticket
// status (what a real gate display would show), not the recovery run's
// narrative (that lives in the ribbon below, since "Maestravl is checking
// what this affects" doesn't fit a one-word pill).
const SEGMENT_STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  SCHEDULED: { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.6)', label: 'Scheduled' },
  BOARDING: { bg: 'rgba(74,160,216,0.12)', fg: '#4aa0d8', label: 'Boarding' },
  DEPARTED: { bg: 'rgba(74,160,216,0.12)', fg: '#4aa0d8', label: 'Departed' },
  DELAYED: { bg: 'rgba(212,168,83,0.15)', fg: '#d4a853', label: 'Delayed' },
  CANCELLED: { bg: 'rgba(229,72,77,0.12)', fg: '#e5484d', label: 'Cancelled' },
  ARRIVED: { bg: 'rgba(82,183,136,0.12)', fg: '#52b788', label: 'Arrived' },
  COMPLETED: { bg: 'rgba(82,183,136,0.12)', fg: '#52b788', label: 'Completed' },
}

const RUN_TONE_COLOR: Record<string, { bg: string; fg: string }> = {
  progress: { bg: 'rgba(74,160,216,0.08)', fg: '#4aa0d8' },
  attention: { bg: 'rgba(212,168,83,0.1)', fg: '#d4a853' },
  resolved: { bg: 'rgba(82,183,136,0.08)', fg: '#52b788' },
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

const CHECK_STATUS_STYLES: Record<string, { bg: string; fg: string }> = {
  ON_TIME: { bg: 'rgba(82,183,136,0.12)', fg: '#52b788' },
  ARRIVED: { bg: 'rgba(82,183,136,0.12)', fg: '#52b788' },
  BOARDING: { bg: 'rgba(74,160,216,0.12)', fg: '#4aa0d8' },
  DEPARTED: { bg: 'rgba(74,160,216,0.12)', fg: '#4aa0d8' },
  DELAYED: { bg: 'rgba(212,168,83,0.15)', fg: '#d4a853' },
  CANCELLED: { bg: 'rgba(229,72,77,0.12)', fg: '#e5484d' },
  UNKNOWN: { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.5)' },
}

// Timezone-aware — renders in the segment's own departure/arrival zone
// (see lib/dateFormat.ts's resolveSegmentZones), not the viewer's browser
// zone. `timezone: null` (e.g. system-event timestamps like "last checked")
// intentionally falls back to plain-language "local time" rather than
// guessing a specific zone.
function formatDateTime(iso: string | null, timezone: string | null = null) {
  if (!iso) return null
  return formatFriendlyTime(new Date(iso), timezone)
}

const MONITORING_LABEL: Record<string, string> = {
  NOT_CONFIGURED: 'Monitoring not yet connected',
  ACTIVE: 'Actively monitored',
  PAUSED: 'Monitoring paused',
  ERROR: 'Monitoring error',
}

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

interface Communication {
  id: string
  direction: 'OUTBOUND' | 'INBOUND'
  channel: string
  subject: string | null
  content: string
  status: string
  sentAt: string | null
  respondedAt: string | null
  createdAt: string
}

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.round(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso))
}

/** A real sent/received message — the proof behind a run's status, not another paraphrase. Ported from the old TripRecoveryStatus.tsx unchanged. */
function MessageCard({ message }: { message: Communication }) {
  const isInbound = message.direction === 'INBOUND'
  return (
    <div className="rounded-lg p-3" style={{ background: isInbound ? 'rgba(82,183,136,0.06)' : 'rgba(255,255,255,0.03)' }}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span
          className="text-label px-1.5 py-0.5 rounded"
          style={{ fontSize: '0.58rem', background: isInbound ? 'rgba(82,183,136,0.15)' : 'rgba(74,160,216,0.15)', color: isInbound ? '#52b788' : '#4aa0d8' }}
        >
          {isInbound ? "Provider's reply" : 'Sent by Maestravl'}
        </span>
        <span className="text-label text-white/30" style={{ fontSize: '0.6rem' }}>{formatRelativeTime(message.createdAt)}</span>
      </div>
      {message.subject && (
        <p className="text-editorial text-white/80 font-medium mb-1" style={{ fontSize: '0.78rem' }}>{message.subject}</p>
      )}
      <p className="text-editorial text-white/60 whitespace-pre-wrap" style={{ fontSize: '0.78rem', lineHeight: 1.55 }}>
        {message.content}
      </p>
    </div>
  )
}

function MessagesPanel({ runId }: { runId: string }) {
  const [messages, setMessages] = useState<Communication[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/agent-runs/${runId}/communications`)
      .then((res) => (res.ok ? res.json() : { communications: [] }))
      .then((data) => { if (!cancelled) setMessages(data.communications) })
      .catch(() => { if (!cancelled) setMessages([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [runId])

  if (loading && !messages) {
    return <p className="text-label text-white/30 py-2" style={{ fontSize: '0.65rem' }}>Loading messages…</p>
  }
  if (!messages || messages.length === 0) {
    return <p className="text-label text-white/30 py-2" style={{ fontSize: '0.65rem' }}>No messages sent or received for this yet.</p>
  }
  return (
    <div className="flex flex-col gap-2 py-2">
      {messages.map((m) => <MessageCard key={m.id} message={m} />)}
    </div>
  )
}

export default function BoardingPass({ segment, passengers, nextSegment, homeTimezone }: { segment: SegmentDTO; passengers: PassengerDTO[]; nextSegment: SegmentDTO | null; homeTimezone: string | null }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportNewTime, setReportNewTime] = useState(() => toLocalInputValue(segment.departureTime))
  const [reporting, setReporting] = useState(false)
  const [reportResult, setReportResult] = useState<ReportResult | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [messagesOpen, setMessagesOpen] = useState(false)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [resolveNote, setResolveNote] = useState('')
  const [resolving, setResolving] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: segment.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  let confidenceScores: Record<string, number> = {}
  try {
    confidenceScores = segment.confidenceScores ? JSON.parse(segment.confidenceScores) : {}
  } catch { /* ignore */ }
  const fieldsNeedingReview = Object.entries(confidenceScores).filter(([, v]) => v < 70)
  const checkStatus = parseCheckStatus(segment.monitoring?.lastKnownData ?? null)
  const linkedPassengers = passengers.filter((p) => segment.passengerIds.includes(p.id))
  const segmentZones = resolveSegmentZones(segment)

  const reportTimeLabel = getFieldProfile(segment.transportType).departureTimeLabel
  const reportTimeLabelLower = reportTimeLabel.charAt(0).toLowerCase() + reportTimeLabel.slice(1)

  const uberPickup = locationText(segment, 'arrival')
  const uberDropoff = nextSegment ? locationText(nextSegment, 'departure') : null
  const uberPlausible = isPlausibleUberTrip(segment.arrivalLocationCode, nextSegment?.departureLocationCode ?? null)
  const clientId = process.env.NEXT_PUBLIC_UBER_CLIENT_ID
  const uberHref =
    isUberConfigured() && clientId && (segment.status === 'DELAYED' || segment.status === 'CANCELLED') && uberPickup && uberDropoff && uberPlausible
      ? buildUberDeepLink({ clientId, pickup: uberPickup, dropoff: uberDropoff })
      : null

  const activeRun = segment.activeRun
  // The ribbon stays up while a run is genuinely still open, and for one
  // more render after a CONFIRMED reschedule so the passenger actually
  // sees the "you're all set" moment rather than it vanishing the instant
  // the terminal status lands.
  const showRibbon = Boolean(activeRun && (!isTerminalRunStatus(activeRun.status) || activeRun.status === 'CONFIRMED'))
  const isReschedulingPrompt = activeRun?.status === 'RESCHEDULING'
  const canResolve = activeRun?.status === 'WAITING_FOR_RESPONSE' || activeRun?.status === 'ACTION_REQUIRED'
  const runTone = activeRun ? toneOf(activeRun.status) : null
  const runHeadline = activeRun ? (STATUS_COPY[activeRun.status]?.headline ?? activeRun.status) : null
  const pillStyle = SEGMENT_STATUS_STYLES[segment.status] ?? { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.6)', label: segment.status }

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

  async function handleConfirmReschedule(accept: boolean) {
    if (!activeRun) return
    setConfirming(true)
    await fetch(`/api/agent-runs/${activeRun.id}/confirm-reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accept }),
    })
    setConfirming(false)
    router.refresh()
  }

  async function handleResolve() {
    if (!activeRun) return
    setResolving(true)
    await fetch(`/api/agent-runs/${activeRun.id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: resolveNote.trim() || undefined }),
    })
    setResolving(false)
    setResolveOpen(false)
    setResolveNote('')
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
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>{TRANSPORT_ICONS[segment.transportType] ?? '•'}</span>
            <p className="text-editorial text-white font-medium truncate">
              {segment.provider || segment.transportType} {segment.identifier ? `· ${segment.identifier}` : ''}
            </p>
          </div>
          <span
            key={segment.status}
            className="text-label px-2.5 py-1 rounded-full whitespace-nowrap fade-in-text"
            style={{ background: pillStyle.bg, color: pillStyle.fg, fontSize: '0.62rem' }}
          >
            {pillStyle.label}
          </span>
        </div>

        {(segment.departureLocationCode || segment.arrivalLocationCode) && (
          <div className="flex items-center gap-3 mb-1">
            <span className="text-display text-white" style={{ fontSize: '1.5rem' }}>{segment.departureLocationCode ?? '?'}</span>
            <span className="text-white/25" aria-hidden="true">→</span>
            <span className="text-display text-white" style={{ fontSize: '1.5rem' }}>{segment.arrivalLocationCode ?? '?'}</span>
          </div>
        )}
        {(segment.departureLocation || segment.arrivalLocation) && (
          <p className="text-editorial text-white/50 mb-3" style={{ fontSize: '0.82rem' }}>
            {segment.departureLocation ?? '?'} → {segment.arrivalLocation ?? '?'}
          </p>
        )}

        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {segment.departureTime && (
            <div key={`dep-${segment.departureTime}`} className="fade-in-text">
              <p className="text-label text-white/25" style={{ fontSize: '0.58rem' }}>Departs</p>
              <p className="text-editorial text-white/80" style={{ fontSize: '0.85rem' }}>{formatDateTime(segment.departureTime, segmentZones.departure)}</p>
            </div>
          )}
          {segment.arrivalTime && (
            <div key={`arr-${segment.arrivalTime}`} className="fade-in-text">
              <p className="text-label text-white/25" style={{ fontSize: '0.58rem' }}>Arrives</p>
              <p className="text-editorial text-white/80" style={{ fontSize: '0.85rem' }}>{formatDateTime(segment.arrivalTime, segmentZones.arrival)}</p>
            </div>
          )}
          {(segment.departureGate || segment.departureTerminal) && (
            <div>
              <p className="text-label text-white/25" style={{ fontSize: '0.58rem' }}>Gate / Terminal</p>
              <p className="text-editorial text-white/80" style={{ fontSize: '0.85rem' }}>{[segment.departureGate, segment.departureTerminal].filter(Boolean).join(' · ')}</p>
            </div>
          )}
          {segment.seat && (
            <div>
              <p className="text-label text-white/25" style={{ fontSize: '0.58rem' }}>Seat</p>
              <p className="text-editorial text-white/80" style={{ fontSize: '0.85rem' }}>{segment.seat}</p>
            </div>
          )}
          {segment.confirmationNumber && (
            <div>
              <p className="text-label text-white/25" style={{ fontSize: '0.58rem' }}>Confirmation</p>
              <p className="text-editorial text-white/80" style={{ fontSize: '0.85rem' }}>{segment.confirmationNumber}</p>
            </div>
          )}
        </div>

        <SegmentWorldClock segment={segment} homeTimezone={homeTimezone} />

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

        {showRibbon && activeRun && (
          <div
            key={`${activeRun.id}-${activeRun.status}-${activeRun.summary ?? ''}`}
            className="mt-3 rounded-lg p-3 fade-in-text"
            style={{ background: (runTone && RUN_TONE_COLOR[runTone]?.bg) || 'rgba(255,255,255,0.04)' }}
          >
            <p className="text-editorial text-white/85" style={{ fontSize: '0.82rem', lineHeight: 1.55 }}>
              {isReschedulingPrompt ? activeRun.summary : runHeadline}
            </p>
            {isReschedulingPrompt && (
              <p className="text-label text-white/40 mt-1.5" style={{ fontSize: '0.58rem' }}>
                Maestravl thinks this reply means yes, but only you can confirm it — check the messages below before deciding.
              </p>
            )}
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              {isReschedulingPrompt && (
                <>
                  <button
                    onClick={() => handleConfirmReschedule(true)}
                    disabled={confirming}
                    className="px-3.5 py-1.5 rounded-full text-label disabled:opacity-50"
                    style={{ background: 'var(--warm-white)', color: 'var(--charcoal)', fontSize: '0.62rem' }}
                  >
                    {confirming ? 'Updating…' : 'Confirm — update itinerary'}
                  </button>
                  <button
                    onClick={() => handleConfirmReschedule(false)}
                    disabled={confirming}
                    className="px-3.5 py-1.5 rounded-full text-label disabled:opacity-50 border border-white/15"
                    style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.62rem' }}
                  >
                    Not quite
                  </button>
                </>
              )}
              {canResolve && !resolveOpen && (
                <button
                  onClick={() => setResolveOpen(true)}
                  className="text-label text-white/40 hover:text-white/80"
                  style={{ fontSize: '0.6rem' }}
                >
                  Heard back?
                </button>
              )}
              <button
                onClick={() => setMessagesOpen((v) => !v)}
                className="text-label text-white/40 hover:text-white/80"
                style={{ fontSize: '0.6rem' }}
              >
                {messagesOpen ? 'Hide messages' : 'View messages'}
              </button>
            </div>

            {resolveOpen && canResolve && (
              <div className="flex flex-col gap-2 mt-2.5 pt-2.5 border-t border-white/10">
                <p className="text-label text-white/40" style={{ fontSize: '0.58rem' }}>
                  Maestravl can't yet tell automatically when a provider replies — if you heard back yourself, let it know here.
                </p>
                <textarea
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  placeholder="What did they say? (optional)"
                  rows={2}
                  className="glass-card px-3 py-2 text-editorial text-white bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
                  style={{ fontSize: '0.8rem' }}
                />
                <button
                  onClick={handleResolve}
                  disabled={resolving}
                  className="self-start px-3.5 py-1.5 rounded-full text-label disabled:opacity-50"
                  style={{ background: 'var(--warm-white)', color: 'var(--charcoal)', fontSize: '0.62rem' }}
                >
                  {resolving ? 'Saving…' : 'Mark as resolved'}
                </button>
              </div>
            )}

            {messagesOpen && <MessagesPanel runId={activeRun.id} />}
          </div>
        )}

        <button
          onClick={() => setManageOpen((v) => !v)}
          className="text-label text-white/30 hover:text-white/70 mt-3"
          style={{ fontSize: '0.6rem' }}
        >
          {manageOpen ? 'Hide details' : 'Manage'}
        </button>

        {manageOpen && (
          <div className="mt-3 pt-3 border-t border-white/10 flex flex-col gap-3">
            <div className="flex gap-1.5">
              <button onClick={() => setEditing(true)} className="text-label text-white/40 hover:text-white/80" style={{ fontSize: '0.65rem' }}>Edit</button>
              <button onClick={handleDelete} disabled={deleting} className="text-label text-white/40 hover:text-red-400" style={{ fontSize: '0.65rem' }}>
                {deleting ? '…' : 'Remove'}
              </button>
            </div>

            <p className="text-label text-white/25" style={{ fontSize: '0.6rem' }}>
              {linkedPassengers.length === 0
                ? 'No passengers linked — won\'t be notified of changes'
                : `Notifies: ${linkedPassengers.map((p) => p.email ? p.name : `${p.name} (no email)`).join(', ')}`}
            </p>

            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-label text-white/20" style={{ fontSize: '0.6rem' }}>
                {monitoringLabel(segment.monitoring)}
                {segment.monitoring?.lastCheckedAt && ` · last checked ${formatDateTime(segment.monitoring.lastCheckedAt)}`}
              </p>
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
              <div className="glass-card p-3 flex flex-col gap-2.5">
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
                    {reportResult.message ?? 'Reported — see the status ribbon above.'}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

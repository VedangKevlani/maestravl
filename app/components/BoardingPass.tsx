'use client'
import { useEffect, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRouter } from 'next/navigation'
import { ArrowRight, ChevronDown, Bell, GripVertical, Eye, EyeOff } from 'lucide-react'
import DelayModal from './DelayModal'
import SegmentUpdatesModal from './SegmentUpdatesModal'
import { useSegmentUnreadUpdates } from './useSegmentUnreadUpdates'
import ConfidenceBadge from './ConfidenceBadge'
import SegmentModal from './SegmentModal'
import { type PassengerDTO, type SegmentDTO } from './types'
import { TransportTypeIcon } from './transportIcons'
import { formatMonitoringStatus } from '@/lib/monitoring/format'
import { toLocalInputValue } from './dateInput'
import { isUberConfigured, locationText, buildUberDeepLink, isPlausibleUberTrip } from '@/lib/uber'
import { getFieldProfile } from './segmentFieldProfiles'
import { formatFriendlyTime, resolveSegmentZones } from '@/lib/dateFormat'
import ConfirmDialog from './ConfirmDialog'
import { STATUS_COPY, toneOf } from '@/lib/agents/statusCopy'
import { isTerminalRunStatus } from '@/lib/constants'
import styles from '../styles/trip.module.css'

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

function formatDateLong(iso: string | null) {
  if (!iso) return null
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(iso))
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

export default function BoardingPass({ tripId, segment, passengers, nextSegment, homeTimezone }: { tripId: string; segment: SegmentDTO; passengers: PassengerDTO[]; nextSegment: SegmentDTO | null; homeTimezone: string | null }) {
  const router = useRouter()
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportNewTime, setReportNewTime] = useState(() => toLocalInputValue(segment.departureTime))
  const [reporting, setReporting] = useState(false)
  const [reportResult, setReportResult] = useState<ReportResult | null>(null)
  const { hasUnseen: hasUnseenUpdates, markSeen: markUpdatesSeen } = useSegmentUnreadUpdates(tripId, segment.id)
  const [messagesOpen, setMessagesOpen] = useState(false)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [resolveNote, setResolveNote] = useState('')
  const [resolving, setResolving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [approving, setApproving] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [delayModalOpen, setDelayModalOpen] = useState(false)
  const [updatesModalOpen, setUpdatesModalOpen] = useState(false)
  const [extraOpen, setExtraOpen] = useState(false)

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
  const pendingContactApproval = activeRun?.status === 'AWAITING_APPROVAL' ? activeRun.pendingContactApproval : null
  const canResolve = activeRun?.status === 'WAITING_FOR_RESPONSE' || activeRun?.status === 'ACTION_REQUIRED'
  const runTone = activeRun ? toneOf(activeRun.status) : null
  const runHeadline = activeRun ? (STATUS_COPY[activeRun.status]?.headline ?? activeRun.status) : null
  const pillStyle = SEGMENT_STATUS_STYLES[segment.status] ?? { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.6)', label: segment.status }

  function handleDeleteClick() {
    setDeleteConfirmOpen(true)
  }

  async function handleDeleteConfirmed() {
    setDeleting(true)
    await fetch(`/api/segments/${segment.id}`, { method: 'DELETE' })
    setDeleteConfirmOpen(false)
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

  async function handleApproveContact(approve: boolean) {
    if (!activeRun || !pendingContactApproval) return
    setApproving(true)
    await fetch(`/api/agent-runs/${activeRun.id}/approve-contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ communicationId: pendingContactApproval.communicationId, approve }),
    })
    setApproving(false)
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

  return (
    <div ref={setNodeRef} style={style} data-tour="segment-card" id={`seg-${segment.id}`} className={styles.segBlock}>
      <div className={styles.segMetaRow}>
        {segment.monitoring?.status !== 'PAUSED' ? (
          <span data-tip="Maestro is actively watching this segment">
            <Eye size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle', opacity: 0.8 }} />
            LAST CHECKED: {segment.monitoring?.lastCheckedAt ? formatRelativeTime(segment.monitoring.lastCheckedAt) : 'just now'}
          </span>
        ) : (
          <span data-tip="Maestro is not monitoring this segment">
            <EyeOff size={12} style={{ display: 'inline', verticalAlign: 'middle', opacity: 0.8 }} />
          </span>
        )}
        {segment.monitoring?.status !== 'PAUSED' ? (
          <span
            className={styles.checkStatusBtn}
            data-tip="Ask Maestro to re-check this segment's status right now"
            onClick={handleCheckNow}
            style={{ cursor: checking ? 'wait' : 'pointer' }}
          >
            {checking ? 'Checking…' : 'Check Status Now'}
          </span>
        ) : null}
        <div className={styles.metaSpacer} />
        <div
          className={styles.bellDot}
          onClick={() => { setUpdatesModalOpen(true); markUpdatesSeen() }}
          data-tip="View all Maestro updates and alerts for this segment"
        >
          <Bell size={13} />
          {hasUnseenUpdates && <span className={styles.segUnreadDot} aria-hidden="true" />}
        </div>
        <button
          type="button"
          data-tip="Flag a delay or cancellation to start recovery"
          onClick={() => setDelayModalOpen(true)}
          className={styles.smallBtn}
        >
          Report Delay
        </button>
      </div>

      <div className={styles.segRow}>
        <button
          {...attributes} {...listeners}
          aria-label="Drag to reorder"
          className={styles.segDrag}
        >
          <GripVertical size={16} />
        </button>

        <div className={styles.ticketCard}>
          <div className={styles.ticketSide}>
            <div className={styles.ticketIcon}>
              <TransportTypeIcon type={segment.transportType} size={20} />
            </div>
            <div className={styles.segTypeLabel}>
              {segment.transportType.toUpperCase()}
            </div>
          </div>

          <div className={styles.ticketMain}>
            <div className={styles.ticketHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span
                  className={styles.updatesSent}
                  onClick={() => { setUpdatesModalOpen(true); markUpdatesSeen() }}
                  data-tip="View all Maestro updates and alerts for this segment"
                >
                  <Bell size={11} />
                  {hasUnseenUpdates && <span className={styles.segUnreadDot} aria-hidden="true" />}
                  {linkedPassengers.length === 0
                    ? 'No passengers notified'
                    : `Updates sent to: ${linkedPassengers.map((p) => p.name).join(', ')}`}
                </span>
                {fieldsNeedingReview.length > 0 && (
                  <div className="flex items-center gap-1">
                    {fieldsNeedingReview.map(([field, score]) => (
                      <ConfidenceBadge key={field} confidence={score} />
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                <span
                  key={segment.status}
                  className={styles.confidenceBadge}
                  style={{ background: pillStyle.bg, color: pillStyle.fg }}
                >
                  {pillStyle.label.toUpperCase()}
                </span>
                <div
                  className={styles.ticketExpand}
                  onClick={() => setExtraOpen((v) => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px',
                    borderRadius: '50%', background: 'rgba(255, 255, 255, 0.05)', color: 'rgba(255, 255, 255, 0.6)',
                    cursor: 'pointer', transition: 'all 0.15s ease'
                  }}
                  data-tip="Show gate, seat, and confirmation details"
                >
                  <ChevronDown size={13} style={{ transform: extraOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
                </div>
              </div>
            </div>

            <div className={styles.ticketFlightline}>
              <span className={styles.carrier}>
                {segment.provider || segment.transportType} {segment.identifier ? `· ${segment.identifier}` : ''}
              </span>
              <span className={styles.ticketDate}>
                {segment.departureTime ? formatDateLong(segment.departureTime)?.toUpperCase() : ''}
              </span>
            </div>

            {(segment.departureLocationCode || segment.arrivalLocationCode || segment.departureLocation || segment.arrivalLocation) && (() => {
              const prof = getFieldProfile(segment.transportType)
              const showCodes = prof.hasRoute && (prof as any).hasTerminalGate
              return (
                <div className={styles.ticketRoute}>
                  <div className={styles.ticketEndpoint}>
                    <div className={styles.code}>
                      {showCodes ? (segment.departureLocationCode ?? '—') : (segment.departureLocation ?? '—')}
                    </div>
                    {showCodes && <div className={styles.place}>{segment.departureLocation ?? ''}</div>}
                    <div className={styles.time}>{segment.departureTime ? formatDateTime(segment.departureTime, segmentZones.departure) : '—'}</div>
                    <div className={styles.tz}>{segmentZones.departure ?? ''}</div>
                  </div>

                  <div className={styles.ticketArrow}>
                    <ArrowRight size={20} />
                  </div>

                  <div className={`${styles.ticketEndpoint} ${styles.ticketEndpointRight}`}>
                    <div className={styles.code}>
                      {showCodes ? (segment.arrivalLocationCode ?? '—') : (segment.arrivalLocation ?? '—')}
                    </div>
                    {showCodes && <div className={styles.place}>{segment.arrivalLocation ?? ''}</div>}
                    <div className={styles.time}>{segment.arrivalTime ? formatDateTime(segment.arrivalTime, segmentZones.arrival) : '—'}</div>
                    <div className={styles.tz}>{segmentZones.arrival ?? ''}</div>
                  </div>
                </div>
              )
            })()}

            {showRibbon && activeRun && (
              <div
                key={`${activeRun.id}-${activeRun.status}-${activeRun.summary ?? ''}`}
                className={styles.runRibbon}
                style={{ background: (runTone && RUN_TONE_COLOR[runTone]?.bg) || 'rgba(255,255,255,0.04)' }}
              >
                <p>
                  {isReschedulingPrompt ? activeRun.summary : runHeadline}
                </p>
                {isReschedulingPrompt && (
                  <p className={styles.runRibbonNote}>
                    Maestravl thinks this reply means yes, but only you can confirm it — check the messages below before deciding.
                  </p>
                )}
                {pendingContactApproval && (
                  <p className={styles.runRibbonNote}>
                    Found via {pendingContactApproval.source.toLowerCase().replace('_', ' ')} (confidence {pendingContactApproval.confidence}):{' '}
                    <strong>{pendingContactApproval.contactValue}</strong>. Reach out on your behalf?
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  {isReschedulingPrompt && (
                    <>
                      <button
                        onClick={() => handleConfirmReschedule(true)}
                        disabled={confirming}
                        className={styles.manageBtn}
                      >
                        {confirming ? 'Updating…' : 'Confirm — update itinerary'}
                      </button>
                      <button
                        onClick={() => handleConfirmReschedule(false)}
                        disabled={confirming}
                        className={styles.manageBtnSecondary}
                      >
                        Not quite
                      </button>
                    </>
                  )}
                  {pendingContactApproval && (
                    <>
                      <button
                        onClick={() => handleApproveContact(true)}
                        disabled={approving}
                        className={styles.manageBtn}
                      >
                        {approving ? 'Sending…' : 'Yes, reach out'}
                      </button>
                      <button
                        onClick={() => handleApproveContact(false)}
                        disabled={approving}
                        className={styles.manageBtnSecondary}
                      >
                        No, I'll handle it
                      </button>
                    </>
                  )}
                  {canResolve && !resolveOpen && (
                    <button
                      onClick={() => setResolveOpen(true)}
                      className={styles.linkBtn}
                    >
                      Heard back?
                    </button>
                  )}
                  <button
                    onClick={() => setMessagesOpen((v) => !v)}
                    className={styles.linkBtn}
                  >
                    {messagesOpen ? 'Hide messages' : 'View messages'}
                  </button>
                  <button
                    onClick={() => router.push(`?segment=${segment.id}&tab=updates#trip-activity`)}
                    className={styles.linkBtn}
                  >
                    View full history
                  </button>
                </div>

                {resolveOpen && canResolve && (
                  <div className="flex flex-col gap-2 mt-2.5 pt-2.5 border-t border-white/10">
                    <p className={styles.notifiesNote}>
                      Maestravl can't yet tell automatically when a provider replies — if you heard back yourself, let it know here.
                    </p>
                    <textarea
                      value={resolveNote}
                      onChange={(e) => setResolveNote(e.target.value)}
                      placeholder="What did they say? (optional)"
                      rows={2}
                      className={fieldClassSmall}
                    />
                    <button
                      onClick={handleResolve}
                      disabled={resolving}
                      className={styles.manageBtn}
                    >
                      {resolving ? 'Saving…' : 'Mark as resolved'}
                    </button>
                  </div>
                )}

                {messagesOpen && <MessagesPanel runId={activeRun.id} />}
              </div>
            )}

            {reportOpen && (
              <div className={styles.reportPanel}>
                <p>
                  Manually tell Maestravl this segment was delayed or cancelled — this is exactly what a real detected
                  disruption triggers.
                </p>
                <div className={styles.reportRow}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>New {reportTimeLabelLower}:</span>
                  <input
                    type="datetime-local"
                    value={reportNewTime}
                    onChange={(e) => setReportNewTime(e.target.value)}
                    className={styles.reportInput}
                    aria-label={`New ${reportTimeLabelLower}`}
                  />
                  <button
                    onClick={() => handleReport('DELAYED')}
                    disabled={reporting}
                    className={styles.manageBtn}
                  >
                    {reporting ? 'Reporting…' : 'Report delay'}
                  </button>
                  <button
                    onClick={() => handleReport('CANCELLED')}
                    disabled={reporting}
                    className={styles.manageBtnSecondary}
                  >
                    {reporting ? 'Reporting…' : 'Report cancelled'}
                  </button>
                </div>

                {reportResult && (
                  <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                    {reportResult.message ?? 'Reported — see status above.'}
                  </p>
                )}
              </div>
            )}

            {extraOpen && (segment.departureGate || segment.departureTerminal || segment.seat || segment.confirmationNumber || segment.notes ? (
              <div className={styles.collapseBody} style={{ display: 'block', borderTop: '1.5px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
                <div className={styles.ticketExtra}>
                  {(segment.departureGate || segment.departureTerminal) && (
                    <div>
                      <div className={styles.label}>GATE / TERMINAL</div>
                      <div className={styles.val}>{[segment.departureGate, segment.departureTerminal].filter(Boolean).join(' · ')}</div>
                    </div>
                  )}
                  {segment.seat && (
                    <div>
                      <div className={styles.label}>SEAT</div>
                      <div className={styles.val}>{segment.seat}</div>
                    </div>
                  )}
                  {segment.confirmationNumber && (
                    <div>
                      <div className={styles.label}>CONFIRMATION</div>
                      <div className={styles.val}>{segment.confirmationNumber}</div>
                    </div>
                  )}
                  {segment.notes && (
                    <div style={{ flex: '1 1 100%' }}>
                      <div className={styles.label}>NOTES</div>
                      <div className={styles.val}>{segment.notes}</div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.collapseBody} style={{ display: 'block', borderTop: '1.5px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
                <p style={{ fontSize: '11px', color: 'var(--faint)' }}>No gate, seat, or confirmation details added yet.</p>
              </div>
            ))}

            {uberHref && (
              <div className={styles.ticketFooter}>
                <a
                  href={uberHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.manageBtnSecondary}
                >
                  Get an Uber there →
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px' }}>
        <button
          type="button"
          onClick={() => setEditModalOpen(true)}
          className={styles.manageBtn}
        >
          Manage
        </button>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Remove segment?"
        message="Remove this segment from the trip? This can't be undone."
        confirmLabel="Remove segment"
        danger
        loading={deleting}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <DelayModal
        segmentId={segment.id}
        tripId={tripId}
        isOpen={delayModalOpen}
        onClose={() => setDelayModalOpen(false)}
      />

      <SegmentUpdatesModal
        segmentId={segment.id}
        segmentName={`${segment.provider || segment.transportType} ${segment.identifier || ''}`}
        tripId={tripId}
        isOpen={updatesModalOpen}
        onClose={() => setUpdatesModalOpen(false)}
      />

      <SegmentModal
        tripId={tripId}
        passengers={passengers}
        segment={segment}
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onCreated={() => { setEditModalOpen(false); router.refresh() }}
        onDelete={handleDeleteClick}
        deleting={deleting}
      />
    </div>
  )
}

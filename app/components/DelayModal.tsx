'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { zonedDateTimeToUtc, utcToZonedDateTimeParts, friendlyZoneLabel } from '@/lib/dateFormat'
import styles from '../styles/segmentModal.module.css'

interface Props {
  segmentId: string | null
  tripId: string
  isOpen: boolean
  onClose: () => void
  /** The segment's currently scheduled departure/start, used to prefill the new time. */
  currentDepartureTime?: string | null
  /** The zone the new time is entered in — the same zone the boarding pass shows this segment's departure in (lib/dateFormat.ts's segmentEntryZones). Without it the browser's own zone was silently used, so a passenger travelling outside the segment's zone reported the wrong delay. */
  timezone?: string | null
  /** e.g. "Departure time", "Check-in time" — see app/components/segmentFieldProfiles.ts. */
  timeLabel?: string
}

type ReportKind = 'DELAYED' | 'CANCELLED'

export default function DelayModal({ segmentId, isOpen, onClose, currentDepartureTime = null, timezone = null, timeLabel = 'Departure time' }: Props) {
  const router = useRouter()
  const [kind, setKind] = useState<ReportKind>('DELAYED')
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A report the server accepted but that wasn't disruptive enough to
  // start a recovery run (e.g. under 30 minutes) — previously the modal
  // just closed and nothing visibly happened.
  const [notice, setNotice] = useState<string | null>(null)

  // Fresh form on every open, prefilled with the current schedule so a
  // passenger only has to change what actually moved.
  useEffect(() => {
    if (!isOpen) return
    const current = utcToZonedDateTimeParts(currentDepartureTime, timezone)
    setKind('DELAYED')
    setNewDate(current.date)
    setNewTime(current.time)
    setError(null)
    setNotice(null)
    setSubmitting(false)
  }, [isOpen, currentDepartureTime, timezone])

  if (!isOpen || !segmentId) return null

  const label = timeLabel.charAt(0).toLowerCase() + timeLabel.slice(1)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)

    const body: { status: ReportKind; newDepartureTime?: string } = { status: kind }
    if (kind === 'DELAYED') {
      if (!newDate || !newTime) {
        setError(`Enter the new ${label} — both the date and the time.`)
        return
      }
      const parsed = zonedDateTimeToUtc(newDate, newTime, timezone)
      if (isNaN(parsed.getTime())) {
        setError(`That ${label} doesn't look like a real date and time.`)
        return
      }
      body.newDepartureTime = parsed.toISOString()
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/segments/${segmentId}/report-disruption`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || "Maestravl couldn't record this report. Your entry is still here — try again.")
        return
      }
      if (!data.disruption) {
        setNotice(data.message || 'Reported, but this change is too small to start a recovery.')
        router.refresh()
        return
      }
      onClose()
      router.refresh()
    } catch {
      setError("Couldn't reach Maestravl — check your connection. Your entry is still here, so you can try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={`${styles.overlay} ${styles.centerModal}`} role="dialog" aria-modal="true" aria-labelledby="report-disruption-title">
      <div className={`${styles.modal} ${styles.small}`}>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
        <div className={styles.pad}>
          <h2 id="report-disruption-title" className={styles.title} style={{ marginBottom: '14px' }}>Report A Delay</h2>
          <hr className={styles.hr} style={{ marginBottom: '24px' }} />
          <div className={styles.delayWarn}>
            Tell Maestravl this segment was delayed or cancelled.
          </div>
          <div className={styles.delayNote}>
            * This starts the same recovery a live-detected disruption does: Maestravl checks what else on your trip it affects
            and notifies passengers who have an email or phone on file.
          </div>
          <div className={styles.delayNote} style={{ marginBottom: '16px' }}>
            * It never contacts an airline, hotel, or other provider without asking you first.
          </div>

          <form onSubmit={handleSubmit}>
            <fieldset style={{ border: 0, padding: 0, margin: '24px 0 0', display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
              <legend className={styles.fieldLabel} style={{ marginBottom: '8px' }}>What happened?</legend>
              <label className={styles.passengerCheck}>
                <input type="radio" name="report-kind" checked={kind === 'DELAYED'} onChange={() => setKind('DELAYED')} />
                It&rsquo;s delayed
              </label>
              <label className={styles.passengerCheck}>
                <input type="radio" name="report-kind" checked={kind === 'CANCELLED'} onChange={() => setKind('CANCELLED')} />
                It&rsquo;s cancelled
              </label>
            </fieldset>

            {kind === 'DELAYED' && (
              <>
                <div className={styles.grid2} style={{ marginTop: '16px' }}>
                  <label className={styles.field} style={{ marginBottom: '4px' }}>
                    <span className={styles.fieldLabel}>
                      New {label} — date <span style={{ color: 'var(--danger)' }}>*</span>
                    </span>
                    <input
                      type="date"
                      className={styles.textInput}
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      required
                    />
                  </label>
                  <label className={styles.field} style={{ marginBottom: '4px' }}>
                    <span className={styles.fieldLabel}>
                      New {label} — time <span style={{ color: 'var(--danger)' }}>*</span>
                    </span>
                    <input
                      type="time"
                      className={styles.textInput}
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      required
                    />
                  </label>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
                  In {friendlyZoneLabel(timezone)}, as shown on your booking.
                </p>
              </>
            )}

            {error && <div className={styles.error} role="alert">{error}</div>}
            {notice && (
              <div role="status" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '12px' }}>
                {notice}
              </div>
            )}

            <div className={styles.footer}>
              {notice ? (
                <button type="button" onClick={onClose} className={styles.primaryBtn}>
                  Done
                </button>
              ) : (
                <button type="submit" disabled={submitting} className={styles.primaryBtn}>
                  {submitting ? 'Reporting…' : kind === 'CANCELLED' ? 'Report Cancellation' : 'Report Delay'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

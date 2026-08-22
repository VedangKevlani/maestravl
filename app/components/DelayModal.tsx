'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import styles from '../styles/segmentModal.module.css'

interface Props {
  segmentId: string | null
  tripId: string
  isOpen: boolean
  onClose: () => void
}

export default function DelayModal({ segmentId, tripId, isOpen, onClose }: Props) {
  const router = useRouter()
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen || !segmentId) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!newDate || !newTime) {
      setError('Please select both a new date and time.')
      return
    }

    setSubmitting(true)
    setError(null)

    const dateTimeISO = new Date(`${newDate}T${newTime}`).toISOString()

    const res = await fetch(`/api/trips/${tripId}/segments/${segmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'DELAYED',
        departureTime: dateTimeISO,
      }),
    })

    setSubmitting(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Could not report delay')
      return
    }

    onClose()
    router.refresh()
  }

  return (
    <div className={`${styles.overlay} ${styles.centerModal}`}>
      <div className={`${styles.modal} ${styles.small}`}>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
        <div className={styles.pad}>
          <h2 className={styles.title} style={{ marginBottom: '14px' }}>Report A Delay</h2>
          <hr className={styles.hr} style={{ marginBottom: '24px' }} />
          <div className={styles.delayWarn}>
            Manually tell Maestro this segment was delayed or cancelled below.
          </div>
          <div className={styles.delayNote}>
            * This is exactly what a real detected disruption triggers
          </div>
          <div className={styles.delayNote} style={{ marginBottom: '16px' }}>
            * You can see (and get contacted with updates on) your trip&rsquo;s recovery process without working on live monitoring.
          </div>

          <form onSubmit={handleSubmit}>
            <div className={styles.grid2} style={{ marginTop: '32px' }}>
              <div className={styles.field} style={{ marginBottom: '4px' }}>
                <span className={styles.fieldLabel}>
                  New Departure Date <span style={{ color: 'var(--danger)' }}>*</span>
                </span>
                <input
                  type="date"
                  className={styles.textInput}
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  required
                />
              </div>
              <div className={styles.field} style={{ marginBottom: '4px' }}>
                <span className={styles.fieldLabel}>
                  New Departure Time <span style={{ color: 'var(--danger)' }}>*</span>
                </span>
                <input
                  type="time"
                  className={styles.textInput}
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.footer}>
              <button type="submit" disabled={submitting} className={styles.primaryBtn}>
                {submitting ? 'Reporting…' : 'Report Delay'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

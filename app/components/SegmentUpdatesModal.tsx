'use client'
import { useEffect, useState } from 'react'
import { X, Bell, Clock, Send, AlertTriangle } from 'lucide-react'
import styles from '../styles/segmentModal.module.css'

interface ActivityItem {
  id: string
  segmentId?: string | null
  createdAt: string
  message: string
  type: string
  metadata?: Record<string, unknown>
}

interface Props {
  segmentId: string | null
  segmentName: string
  tripId: string
  isOpen: boolean
  onClose: () => void
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

function formatDateLabel(iso: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(iso))
}

function getIcon(type: string) {
  switch (type) {
    case 'DISRUPTION':
      return <AlertTriangle size={13} color="var(--amber)" />
    case 'AGENT_UPDATE':
      return <Send size={13} color="var(--status-blue)" />
    case 'MONITORING':
      return <Clock size={13} color="var(--accent)" />
    default:
      return <Bell size={13} color="var(--accent)" />
  }
}

export default function SegmentUpdatesModal({ segmentId, segmentName, tripId, isOpen, onClose }: Props) {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !tripId) return
    setLoading(true)
    fetch(`/api/trips/${tripId}/activities`)
      .then((res) => (res.ok ? res.json() : { activities: [] }))
      .then((data) => {
        const filtered = segmentId
          ? (data.activities || []).filter((a: ActivityItem) => a.segmentId === segmentId)
          : data.activities || []
        setActivities(filtered)
      })
      .catch(() => setActivities([]))
      .finally(() => setLoading(false))
  }, [isOpen, tripId, segmentId])

  if (!isOpen) return null

  // Group activities by calendar date, oldest first — same date-header
  // rhythm as segment-updates-modal.js's renderSegUpdatesModal, so a new
  // .tsuDate divider only appears when the day actually changes.
  let lastDateLabel: string | null = null

  return (
    <div className={styles.overlay}>
      <div className={`${styles.modal} ${styles.medium}`}>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
        <div className={styles.pad}>
          <h2 className={styles.title}>
            <small className={styles.titleSmall}>Trip Segment Updates</small>
            {segmentName || 'Segment History'}
          </h2>
          <hr className={styles.hr} style={{ marginBottom: '20px' }} />

          {loading ? (
            <p style={{ color: 'var(--muted)', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>Loading segment updates…</p>
          ) : activities.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)' }}>
              <Bell size={24} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
              <p style={{ fontSize: '13px' }}>No updates logged for this segment yet.</p>
            </div>
          ) : (
            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {activities.map((act, i) => {
                const dateLabel = formatDateLabel(act.createdAt)
                const showDateHeader = dateLabel !== lastDateLabel
                lastDateLabel = dateLabel
                const isLast = i === activities.length - 1
                return (
                  <div key={act.id}>
                    {showDateHeader && <div className={styles.tsuDate}>{dateLabel}</div>}
                    <div className={styles.tsuEntry}>
                      <div className={styles.tsuRail}>
                        <div className={styles.tsuIcon}>{getIcon(act.type)}</div>
                        {!isLast && <div className={styles.tsuLine} />}
                      </div>
                      <div className={styles.tsuContent}>
                        <div className={styles.tsuTime}>{formatTime(act.createdAt)}</div>
                        <div className={styles.tsuBubble}>{act.message}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

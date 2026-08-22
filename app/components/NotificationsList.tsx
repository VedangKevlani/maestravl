'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { BellOff } from 'lucide-react'
import { formatMonitoringStatus } from '@/lib/monitoring/format'
import { TransportTypeIcon } from './transportIcons'
import styles from '../styles/notifications.module.css'

export type NotificationLogDTO = {
  id: string
  tripId: string
  createdAt: Date
  success: boolean
  previousStatus: string | null
  newStatus: string
  channel: string
  recipientName: string | null
  recipientEmail: string | null
  errorMessage: string | null
  trip: { title: string }
  segment: { identifier: string | null; provider: string | null; transportType: string }
}

function formatTime(d: Date) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d)
}

function formatDateHeader(d: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(d)
}

// Maps monitoring statuses onto the reference's four chip colors
// (on-time/arrived = green, boarding/departed = blue, delayed = amber,
// cancelled = danger) — trip.js's status-chip classes, condensed to one
// lookup since this app has more granular statuses than the mockup did.
const CHIP_CLASS: Record<string, string> = {
  ON_TIME: 'chipOnTime',
  ARRIVED: 'chipOnTime',
  BOARDING: 'chipInProgress',
  DEPARTED: 'chipInProgress',
  DELAYED: 'chipDelayed',
  CANCELLED: 'chipCancelled',
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

function StatusChip({ status }: { status: string }) {
  const cls = styles[CHIP_CLASS[status] ?? 'chipInProgress']
  return <span className={`${styles.chip} ${cls}`}>{titleCase(formatMonitoringStatus(status))}</span>
}

type Filter = 'ALL' | 'SENT' | 'FAILED'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'SENT', label: 'Delivered' },
  { key: 'FAILED', label: 'Failed' },
]

export default function NotificationsList({ logs }: { logs: NotificationLogDTO[] }) {
  const [filter, setFilter] = useState<Filter>('ALL')

  const filtered = useMemo(() => {
    if (filter === 'ALL') return logs
    if (filter === 'SENT') return logs.filter((l) => l.success)
    return logs.filter((l) => !l.success)
  }, [logs, filter])

  const groups = useMemo(() => {
    const byDate: { key: string; logs: NotificationLogDTO[] }[] = []
    const index = new Map<string, NotificationLogDTO[]>()
    for (const log of filtered) {
      const key = formatDateHeader(log.createdAt)
      if (!index.has(key)) {
        const bucket: NotificationLogDTO[] = []
        index.set(key, bucket)
        byDate.push({ key, logs: bucket })
      }
      index.get(key)!.push(log)
    }
    return byDate
  }, [filtered])

  return (
    <div>
      <div className={styles.tabs} role="tablist" aria-label="Filter notifications">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={`${styles.tab} ${filter === key ? styles.tabActive : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <BellOff size={20} />
          <p>
            {logs.length === 0
              ? "Nothing here yet. Once a monitored segment's status changes, passengers get notified and it'll show up here."
              : 'No notifications match this filter.'}
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {groups.map((group) => (
            <div key={group.key}>
              <div className={styles.dateHeader}>{group.key}</div>
              {group.logs.map((log) => (
                <Link key={log.id} href={`/trips/${log.tripId}`} className={styles.item}>
                  <div className={`${styles.icon} ${!log.success ? styles.iconFailed : ''}`} aria-hidden="true">
                    <TransportTypeIcon type={log.segment.transportType} size={14} />
                  </div>
                  <div className={styles.text}>
                    <div className={styles.top}>
                      <span className={styles.name}>{log.segment.identifier || log.segment.provider || log.segment.transportType}</span>
                    </div>
                    <div className={styles.statusRow}>
                      {log.previousStatus && <StatusChip status={log.previousStatus} />}
                      {log.previousStatus && <span className={styles.arrow}>→</span>}
                      <StatusChip status={log.newStatus} />
                    </div>
                    <div className={styles.trip}>
                      {log.trip.title}
                      <span className={styles.dot}>·</span>
                      <span className={styles.recipient}>
                        {log.channel === 'NONE' ? 'No passenger email on file' : `${log.recipientName ?? 'Passenger'} · ${log.recipientEmail}`}
                      </span>
                    </div>
                    {!log.success && log.errorMessage && <div className={styles.errorMsg}>{log.errorMessage}</div>}
                  </div>
                  <div className={styles.right}>
                    <span className={styles.time}>{formatTime(log.createdAt)}</span>
                    <span className={`${styles.pill} ${log.success ? styles.pillSent : styles.pillFailed}`}>
                      {log.success ? 'Sent' : 'Failed'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

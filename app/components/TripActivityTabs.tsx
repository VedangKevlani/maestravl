'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Timeline from './Timeline'
import { formatMonitoringStatus } from '@/lib/monitoring/format'
import { getLastSeen, setLastSeen } from './useUnreadNotifications'
import styles from '../styles/trip.module.css'
import type { PassengerDTO, SegmentDTO } from './types'

export type ActivityItemDTO = {
  id: string
  segmentId: string
  segmentLabel: string
  detectedAt: string // ISO
  kind: 'status_change' | 'agent_update'
  // status_change fields
  previousStatus?: string | null
  newStatus?: string
  // agent_update fields
  agentStatus?: string
  summary?: string | null
}

function exportActivityLog(activity: ActivityItemDTO[], tripTitle: string) {
  const lines = activity.map((a) => {
    const when = new Date(a.detectedAt).toLocaleString('en-US')
    if (a.kind === 'status_change') {
      return `${when} — ${a.segmentLabel}: ${a.previousStatus ?? 'unknown'} \u2192 ${a.newStatus}`
    }
    return `${when} — ${a.segmentLabel}: ${a.summary ?? a.agentStatus}`
  })
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${tripTitle.replace(/\s+/g, '-').toLowerCase()}-activity-log.txt`
  link.click()
  URL.revokeObjectURL(url)
}

function TripAttentionBanner({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl px-5 py-4 mb-6 flex items-start gap-3 flex-wrap text-left w-full"
      style={{ background: 'rgba(230,164,74,0.1)', border: '1px solid rgba(230,164,74,0.3)' }}
    >
      <span className="text-editorial" style={{ fontSize: '1.1rem', lineHeight: 1 }}>
        ⚠️
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-editorial text-white" style={{ fontSize: '0.9rem' }}>
          Maestro has an update on this trip
        </p>
        <p className="text-editorial underline mt-1" style={{ fontSize: '0.8rem', color: '#e6a44a' }}>
          View Trip Updates →
        </p>
      </div>
    </button>
  )
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

const AGENT_STATUS_LABELS: Record<string, string> = {
  DETECTED: 'Detected the disruption',
  ANALYZING: 'Analyzing impact',
  CONTACTING: 'Contacting the provider',
  WAITING_FOR_RESPONSE: 'Waiting on a response',
  RESCHEDULING: 'Rescheduling',
  CONFIRMED: 'Confirmed a new plan',
  FAILED: "Couldn't resolve automatically",
  ALTERNATIVE_FOUND: 'Found an alternative',
  ACTION_REQUIRED: 'Needs your input',
  COMPLETED: 'Resolved',
  SUPERSEDED: 'Superseded by a newer update',
}

function ActivityFeed({ activity, segmentLabel, onClearFilter }: { activity: ActivityItemDTO[]; segmentLabel?: string; onClearFilter?: () => void }) {
  return (
    <div>
      {segmentLabel && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-label text-white/40" style={{ fontSize: '0.7rem' }}>
            Showing history for <span className="text-white/70">{segmentLabel}</span>
          </span>
          <button
            type="button"
            onClick={onClearFilter}
            className="text-label text-white/40 hover:text-white/80 underline"
            style={{ fontSize: '0.65rem' }}
          >
            View all
          </button>
        </div>
      )}
      {activity.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-editorial text-white/40" style={{ fontSize: '0.85rem' }}>
            {segmentLabel ? 'No monitoring events or agent actions yet for this segment.' : 'No monitoring events or agent actions yet for this trip.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {activity.map((item) => (
            <div key={item.id} className="glass-card p-5">
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <p className="text-editorial text-white font-medium min-w-0 truncate" style={{ fontSize: '0.9rem' }}>
                  {item.segmentLabel}
                </p>
                <span className="text-label text-white/25 whitespace-nowrap shrink-0" style={{ fontSize: '0.65rem' }}>
                  {formatDateTime(item.detectedAt)}
                </span>
              </div>
              {item.kind === 'status_change' ? (
                <p className="text-editorial text-white/60" style={{ fontSize: '0.8rem' }}>
                  {item.previousStatus ? `${formatMonitoringStatus(item.previousStatus)} → ` : ''}
                  {formatMonitoringStatus(item.newStatus ?? '')}
                </p>
              ) : (
                <p className="text-editorial text-white/60" style={{ fontSize: '0.8rem' }}>
                  {item.summary || AGENT_STATUS_LABELS[item.agentStatus ?? ''] || item.agentStatus}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TripActivityTabs({
  tripId,
  tripTitle,
  segments,
  passengers,
  homeTimezone,
  activity,
}: {
  tripId: string
  tripTitle: string
  segments: SegmentDTO[]
  passengers: PassengerDTO[]
  homeTimezone: string | null
  activity: ActivityItemDTO[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<'timeline' | 'updates'>('timeline')
  const [segmentFilter, setSegmentFilter] = useState<string | null>(null)
  const [hasUnread, setHasUnread] = useState(false)

  // Reads the same global "last seen" watermark the header bell uses
  // (see useUnreadNotifications.ts) and checks whether anything in this
  // trip's own activity feed is newer than it. Deliberately not a second,
  // trip-scoped watermark — one source of truth for "seen" avoids the two
  // ever disagreeing. Runs in an effect (not render) since localStorage
  // isn't available during SSR/hydration.
  useEffect(() => {
    const lastSeen = getLastSeen()
    const lastSeenTime = lastSeen ? new Date(lastSeen).getTime() : 0
    setHasUnread(activity.some((a) => new Date(a.detectedAt).getTime() > lastSeenTime))
  }, [activity])

  // A BoardingPass's "View full history" link lands here with
  // ?segment=<id>&tab=updates — pick that up once on arrival so the tab
  // switches and the feed filters without the parent needing to know.
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    const segmentParam = searchParams.get('segment')
    if (tabParam === 'updates') setTab('updates')
    if (segmentParam) setSegmentFilter(segmentParam)
  }, [searchParams])

  const filteredActivity = useMemo(
    () => (segmentFilter ? activity.filter((a) => a.segmentId === segmentFilter) : activity),
    [activity, segmentFilter]
  )
  const filteredSegmentLabel = segmentFilter ? filteredActivity[0]?.segmentLabel ?? segments.find((s) => s.id === segmentFilter)?.identifier : undefined

  function clearFilter() {
    setSegmentFilter(null)
    router.replace('?tab=updates#trip-activity')
  }

  return (
    <div id="trip-activity">
      {hasUnread && tab === 'timeline' && (
        <TripAttentionBanner
          onClick={() => {
            setTab('updates')
            setHasUnread(false)
            const newest = activity.reduce((max, a) => (a.detectedAt > max ? a.detectedAt : max), '')
            if (newest) setLastSeen(newest)
          }}
        />
      )}
      <div className={styles.tabs} role="tablist" aria-label="Trip view">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'timeline'}
          onClick={() => {
            setTab('timeline')
            setSegmentFilter(null)
          }}
          className={`${styles.tab} ${tab === 'timeline' ? styles.tabActive : ''}`}
          data-tip="Chronological view of all your trip's flights, hotels, and legs"
        >
          Timeline
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'updates'}
          onClick={() => setTab('updates')}
          className={`${styles.tab} ${tab === 'updates' ? styles.tabActive : ''}`}
          data-tip="A log of every alert, delay, and action Maestro has taken for this trip"
        >
          Trip Updates {activity.length > 0 && `(${activity.length})`}
        </button>
        {tab === 'updates' && activity.length > 0 && (
          <button
            type="button"
            onClick={() => exportActivityLog(activity, tripTitle)}
            className={styles.seeMore}
            style={{ marginLeft: 'auto' }}
          >
            Download activity log
          </button>
        )}
      </div>

      <div className={styles.panel} style={{ display: 'block' }}>
        {tab === 'timeline' ? (
          <Timeline tripId={tripId} segments={segments} passengers={passengers} homeTimezone={homeTimezone} />
        ) : (
          <ActivityFeed activity={filteredActivity} segmentLabel={segmentFilter ? filteredSegmentLabel : undefined} onClearFilter={clearFilter} />
        )}
      </div>
    </div>
  )
}

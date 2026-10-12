'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Timeline from './Timeline'
import { getLastSeen, setLastSeen } from './useUnreadNotifications'
import styles from '../styles/trip.module.css'
import type { PassengerDTO, SegmentDTO } from './types'

// One entry from lib/trips/activityFeed.ts — the same feed the per-segment
// updates modal shows, each filed under the segment it concerns.
export type ActivityItemDTO = {
  id: string
  segmentId: string
  segmentLabel: string
  detectedAt: string // ISO
  type: 'DISRUPTION' | 'AGENT_UPDATE' | 'NOTIFICATION'
  message: string
}

const TYPE_LABEL: Record<ActivityItemDTO['type'], string> = {
  DISRUPTION: 'Disruption',
  AGENT_UPDATE: 'Maestravl',
  NOTIFICATION: 'Notification',
}

function exportActivityLog(activity: ActivityItemDTO[], tripTitle: string) {
  const lines = activity.map((a) => {
    const when = new Date(a.detectedAt).toLocaleString('en-US')
    return `${when} — ${a.segmentLabel} — ${TYPE_LABEL[a.type]}: ${a.message}`
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

// No explicit timeZone previously — same deterministic hydration mismatch
// as TripHeader.tsx/SegmentOverview.tsx (confirmed live 2026-10-10, React
// error #418): the server's own zone and a real passenger's browser zone
// essentially never match, and this activity feed is what a passenger
// lands on specifically *because* the boarding-pass view broke — the
// Trip Updates tab the user had to check manually. Falls back to UTC,
// same as the rest of this app's zone-resolution chain.
function formatDateTime(iso: string, zone: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: zone }).format(new Date(iso))
}


function ActivityFeed({ activity, segmentLabel, onClearFilter, homeTimezone }: { activity: ActivityItemDTO[]; segmentLabel?: string; onClearFilter?: () => void; homeTimezone: string | null }) {
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
                  {formatDateTime(item.detectedAt, homeTimezone ?? 'UTC')}
                </span>
              </div>
              <p className="text-editorial text-white/60" style={{ fontSize: '0.8rem' }}>
                <span
                  className="text-label mr-2"
                  style={{ fontSize: '0.6rem', color: item.type === 'DISRUPTION' ? '#d4a853' : item.type === 'NOTIFICATION' ? '#52b788' : '#4aa0d8' }}
                >
                  {TYPE_LABEL[item.type].toUpperCase()}
                </span>
                {item.message}
              </p>
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
          <ActivityFeed activity={filteredActivity} segmentLabel={segmentFilter ? filteredSegmentLabel : undefined} onClearFilter={clearFilter} homeTimezone={homeTimezone} />
        )}
      </div>
    </div>
  )
}

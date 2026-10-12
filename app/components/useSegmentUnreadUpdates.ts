'use client'
import { useEffect, useState } from 'react'

// Per-segment "have I seen the latest update" watermark, same pattern as
// useUnreadNotifications but scoped to a single segment's activity feed
// instead of the global notifications list — so the little red dot on a
// segment's bell icon only lights up for updates on *that* segment.
function storageKey(segmentId: string) {
  return `maestravl:lastSeenSegmentUpdatesAt:${segmentId}`
}

function getLastSeen(segmentId: string): string | null {
  try {
    return localStorage.getItem(storageKey(segmentId))
  } catch {
    return null
  }
}

function setLastSeen(segmentId: string, iso: string) {
  try {
    localStorage.setItem(storageKey(segmentId), iso)
  } catch {
    /* ignore — private browsing / storage disabled */
  }
}

interface ActivityLike {
  segmentId?: string | null
  createdAt: string
}

// Every BoardingPass on a trip mounts this hook at once, and the feed is
// trip-wide — share one in-flight request per trip (briefly cached) rather
// than sending one identical request per segment.
const SHARED_FETCH_TTL_MS = 3000
let sharedFetch: { key: string; at: number; promise: Promise<{ activities?: ActivityLike[] }> } | null = null

function fetchTripActivities(tripId: string) {
  if (sharedFetch && sharedFetch.key === tripId && Date.now() - sharedFetch.at < SHARED_FETCH_TTL_MS) {
    return sharedFetch.promise
  }
  const promise = fetch(`/api/trips/${tripId}/activities`).then((res) => (res.ok ? res.json() : { activities: [] }))
  sharedFetch = { key: tripId, at: Date.now(), promise }
  return promise
}

/**
 * Reads this trip's activity feed, filters to one segment, and reports
 * whether there's anything newer than what's already been seen. Refetches
 * whenever `refreshKey` changes — pass something that changes when this
 * segment gets new activity (e.g. its recovery run's status/summary), so
 * the dot can light up for updates that land while the page is open.
 */
export function useSegmentUnreadUpdates(tripId: string, segmentId: string, refreshKey = '') {
  const [hasUnseen, setHasUnseen] = useState(false)
  const [latestCreatedAt, setLatestCreatedAt] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchTripActivities(tripId)
      .then((data) => {
        if (cancelled) return
        const items: ActivityLike[] = (data.activities || []).filter(
          (a: ActivityLike) => a.segmentId === segmentId,
        )
        if (items.length === 0) return
        const latest = items.reduce((max, a) => (a.createdAt > max ? a.createdAt : max), items[0].createdAt)
        setLatestCreatedAt(latest)
        const lastSeen = getLastSeen(segmentId)
        setHasUnseen(!lastSeen || latest > lastSeen)
      })
      .catch(() => { /* silently no dot if this fails — non-critical */ })
    return () => { cancelled = true }
  }, [tripId, segmentId, refreshKey])

  function markSeen() {
    setHasUnseen(false)
    setLastSeen(segmentId, latestCreatedAt ?? new Date().toISOString())
  }

  return { hasUnseen, markSeen }
}

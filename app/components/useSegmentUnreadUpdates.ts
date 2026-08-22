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

/** Polls this trip's activity feed, filters to one segment, and reports whether there's anything newer than what's already been seen. */
export function useSegmentUnreadUpdates(tripId: string, segmentId: string) {
  const [hasUnseen, setHasUnseen] = useState(false)
  const [latestCreatedAt, setLatestCreatedAt] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/trips/${tripId}/activities`)
      .then((res) => (res.ok ? res.json() : { activities: [] }))
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
  }, [tripId, segmentId])

  function markSeen() {
    setHasUnseen(false)
    setLastSeen(segmentId, latestCreatedAt ?? new Date().toISOString())
  }

  return { hasUnseen, markSeen }
}

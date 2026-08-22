'use client'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'maestravl:lastSeenNotificationsAt'

// No persisted "read" state on NotificationLog (see the unread-count API
// route) — "seen" lives in localStorage on this device only. Good enough
// for a header dot; won't sync across devices/browsers.
// Exported so other trip-scoped UI (the per-trip attention banner in
// TripActivityTabs) can check "is there anything newer than what the user
// has already seen" against this same global watermark, rather than
// tracking a second, trip-scoped last-seen value that could drift out of
// sync with the one the bell icon uses.
export function getLastSeen(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

// Exported for the same reason as getLastSeen above — the per-trip
// attention banner needs to advance this same watermark when its own
// "seen" action fires, so viewing updates from the trip page also clears
// the header bell dot instead of leaving it stale until Notifications is
// opened separately.
export function setLastSeen(iso: string) {
  try {
    localStorage.setItem(STORAGE_KEY, iso)
  } catch {
    /* ignore — private browsing / storage disabled */
  }
}

/** Polls the unread count on mount and exposes a way to clear it (call when the passenger opens Notifications). */
export function useUnreadNotifications() {
  const [count, setCount] = useState(0)
  const [latestSeen, setLatestSeenState] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const since = getLastSeen()
    const url = since ? `/api/notifications/unread-count?since=${encodeURIComponent(since)}` : '/api/notifications/unread-count'
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setCount(data.count ?? 0)
        setLatestSeenState(data.latestCreatedAt ?? null)
      })
      .catch(() => { /* silently no dot if this fails — non-critical */ })
    return () => { cancelled = true }
  }, [])

  function markSeen() {
    setCount(0)
    setLastSeen(latestSeen ?? new Date().toISOString())
  }

  return { unreadCount: count, markSeen }
}

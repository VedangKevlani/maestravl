'use client'
// Opt-in live location via the browser's own Geolocation API — free, no
// service involved. Never starts on its own the first time: the passenger
// turns it on. On later visits it resumes only if they had it on AND the
// browser still reports permission as granted (so no surprise prompt).
// Only that on/off preference is stored; the position itself is kept in
// memory for this page and never sent to Maestravl's server.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LatLng } from '@/lib/map/geo'

const PREF_KEY = 'maestravl:liveLocation'

export interface LiveLocation {
  supported: boolean
  enabled: boolean
  position: (LatLng & { accuracyM: number; at: number }) | null
  error: string | null
  start: () => void
  stop: () => void
}

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === 'on'
  } catch {
    return false
  }
}

function writePref(on: boolean) {
  try {
    if (on) localStorage.setItem(PREF_KEY, 'on')
    else localStorage.removeItem(PREF_KEY)
  } catch {
    /* ignore — private mode */
  }
}

export function useLiveLocation(): LiveLocation {
  const [supported, setSupported] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [position, setPosition] = useState<LiveLocation['position']>(null)
  const [error, setError] = useState<string | null>(null)
  const watchId = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    setEnabled(false)
    setPosition(null)
    writePref(false)
  }, [])

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setSupported(false)
      return
    }
    setError(null)
    setEnabled(true)
    writePref(true)
    if (watchId.current !== null) return
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setError(null)
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy, at: p.timestamp })
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setError('Location permission was declined. You can allow it in your browser’s site settings, then turn this on again.')
          if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
          watchId.current = null
          setEnabled(false)
          writePref(false)
        } else {
          setError("Couldn't get a location fix yet — trying again.")
        }
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 }
    )
  }, [])

  // Resume only when it was on before and permission is already granted.
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setSupported(false)
      return
    }
    if (!readPref()) return
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions
    if (!perms?.query) return
    perms
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (status.state === 'granted') start()
      })
      .catch(() => {})
  }, [start])

  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
  }, [])

  return { supported, enabled, position, error, start, stop }
}

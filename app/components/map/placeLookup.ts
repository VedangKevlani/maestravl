'use client'
// Browser-only lookups for the trip map, both free and keyless:
//
// - geocodePlace: OpenStreetMap Nominatim, for places with no airport code
//   (hotels, restaurants, stations). Its usage policy allows at most one
//   request per second and asks for caching, so every lookup goes through
//   a single queue spaced >1s apart and is cached in localStorage — a
//   place is looked up once per browser, ever. Free, but a shared public
//   service: heavy traffic would need a self-hosted instance.
// - nearbyLandmarks: Wikipedia's geosearch API (no key, CORS-enabled).
//   Only a ~1 km-rounded position is ever sent, never the exact one.
//
// Nothing here talks to Maestravl's own server, so the passenger's live
// location never leaves their browser except as that rounded landmark query.
import type { LatLng } from '@/lib/map/geo'

const CACHE_PREFIX = 'maestravl:geocode:v1:'
const NOMINATIM_SPACING_MS = 1100

function readCache(query: string): LatLng | null | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + query.toLowerCase())
    if (raw === null) return undefined
    return JSON.parse(raw) as LatLng | null
  } catch {
    return undefined
  }
}

function writeCache(query: string, value: LatLng | null) {
  try {
    localStorage.setItem(CACHE_PREFIX + query.toLowerCase(), JSON.stringify(value))
  } catch {
    /* storage full or disabled — the lookup just repeats next visit */
  }
}

let queue: Promise<unknown> = Promise.resolve()
const inFlight = new Map<string, Promise<LatLng | null>>()

/** Null when the place genuinely can't be found (also cached, so it isn't retried every visit). */
export function geocodePlace(query: string): Promise<LatLng | null> {
  const q = query.trim()
  if (!q) return Promise.resolve(null)
  const cached = readCache(q)
  if (cached !== undefined) return Promise.resolve(cached)
  const existing = inFlight.get(q.toLowerCase())
  if (existing) return existing

  const job = queue.then(async () => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) return null // don't cache transient failures
      const rows = (await res.json()) as { lat: string; lon: string }[]
      const hit = rows[0] ? { lat: Number(rows[0].lat), lng: Number(rows[0].lon) } : null
      writeCache(q, hit)
      return hit
    } catch {
      return null
    } finally {
      await new Promise((r) => setTimeout(r, NOMINATIM_SPACING_MS))
    }
  })
  queue = job
  inFlight.set(q.toLowerCase(), job)
  job.finally(() => inFlight.delete(q.toLowerCase()))
  return job
}

export interface Landmark {
  title: string
  distanceKm: number
  lat: number
  lng: number
  url: string
}

/** Wikipedia articles near a point (max 10 km radius). Coordinates are rounded to ~1 km before sending. */
export async function nearbyLandmarks(point: LatLng, radiusKm = 5, limit = 8): Promise<Landmark[]> {
  const lat = point.lat.toFixed(2)
  const lng = point.lng.toFixed(2)
  const radius = Math.min(10000, Math.round(radiusKm * 1000))
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}%7C${lng}&gsradius=${radius}&gslimit=${limit}&format=json&origin=*`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Wikipedia responded ${res.status}`)
  const data = (await res.json()) as { query?: { geosearch?: { pageid: number; title: string; lat: number; lon: number; dist: number }[] } }
  return (data.query?.geosearch ?? []).map((g) => ({
    title: g.title,
    distanceKm: g.dist / 1000,
    lat: g.lat,
    lng: g.lon,
    url: `https://en.wikipedia.org/?curid=${g.pageid}`,
  }))
}

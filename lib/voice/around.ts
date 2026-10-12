// Impure — the "around your trip" lookups the voice assistant can make.
// All free and keyless, all safe for commercial use, each with its limits:
//
// - Weather: MET Norway Locationforecast 2.0 (api.met.no). Free, CC BY 4.0
//   (attribution shown in the chat), ~9 days ahead. Its terms require an
//   identifying User-Agent and honouring cache headers — responses are
//   cached in memory until they expire. (Open-Meteo was ruled out: its free
//   tier is non-commercial only.)
// - Places: Wikipedia geosearch. Free; asks for an identifying User-Agent.
// - Geocoding free-text places: OpenStreetMap Nominatim. Max 1 request/s
//   per its policy — queued here, and cached in memory.
// - Exchange rates: ExchangeRate-API open access (open.er-api.com). Free,
//   daily rates, attribution required; cached for 12 hours.
//
// Never throws — every function resolves to null on failure, and the tool
// tells the user plainly that the lookup isn't available right now.
import type { LatLng } from '@/lib/map/geo'
import type { MetTimeseriesEntry } from './aroundPure'

const USER_AGENT = 'Maestravl/1.0 (+https://maestravl.com; operators@maestravl.com)'
const TIMEOUT_MS = 8000

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<{ data: T; expires: number | null } | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) {
      console.warn('[voice/around] lookup failed', res.status, url.split('?')[0])
      return null
    }
    const expiresHeader = res.headers.get('expires')
    return { data: (await res.json()) as T, expires: expiresHeader ? Date.parse(expiresHeader) : null }
  } catch (err) {
    console.warn('[voice/around] lookup error', url.split('?')[0], err instanceof Error ? err.message : err)
    return null
  }
}

// ----------------------------------------------------------- geocoding

const geocodeCache = new Map<string, LatLng | null>()
let nominatimQueue: Promise<unknown> = Promise.resolve()

export function geocode(query: string): Promise<LatLng | null> {
  const key = query.trim().toLowerCase()
  if (!key) return Promise.resolve(null)
  if (geocodeCache.has(key)) return Promise.resolve(geocodeCache.get(key)!)
  const job = nominatimQueue.then(async () => {
    const hit = await getJson<{ lat: string; lon: string }[]>(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`)
    await new Promise((r) => setTimeout(r, 1100)) // policy: max 1 request per second
    if (!hit) return null // transient — not cached
    const point = hit.data[0] ? { lat: Number(hit.data[0].lat), lng: Number(hit.data[0].lon) } : null
    geocodeCache.set(key, point)
    return point
  })
  nominatimQueue = job
  return job
}

// -------------------------------------------------------------- weather

const forecastCache = new Map<string, { series: MetTimeseriesEntry[]; expires: number }>()

export async function forecastAt(point: LatLng): Promise<MetTimeseriesEntry[] | null> {
  // MET asks for coordinates rounded to 4 decimals at most; 2 also improves cache hits.
  const lat = point.lat.toFixed(2)
  const lon = point.lng.toFixed(2)
  const key = `${lat},${lon}`
  const cached = forecastCache.get(key)
  if (cached && cached.expires > Date.now()) return cached.series
  const res = await getJson<{ properties?: { timeseries?: MetTimeseriesEntry[] } }>(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`)
  const series = res?.data.properties?.timeseries
  if (!series) return null
  forecastCache.set(key, { series, expires: res!.expires ?? Date.now() + 30 * 60_000 })
  return series
}

// -------------------------------------------------------------- places

export async function placesNear(point: LatLng, limit = 6): Promise<{ title: string; distanceKm: number }[] | null> {
  const res = await getJson<{ query?: { geosearch?: { title: string; dist: number }[] } }>(
    `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${point.lat.toFixed(4)}%7C${point.lng.toFixed(4)}&gsradius=5000&gslimit=${limit}&format=json`
  )
  if (!res) return null
  return (res.data.query?.geosearch ?? []).map((g) => ({ title: g.title, distanceKm: Math.round(g.dist / 100) / 10 }))
}

// ------------------------------------------------------------ currency

let ratesCache: { rates: Record<string, number>; updated: string; expires: number } | null = null

export async function usdRates(): Promise<{ rates: Record<string, number>; updated: string } | null> {
  if (ratesCache && ratesCache.expires > Date.now()) return ratesCache
  const res = await getJson<{ result?: string; rates?: Record<string, number>; time_last_update_utc?: string }>('https://open.er-api.com/v6/latest/USD')
  if (!res || res.data.result !== 'success' || !res.data.rates) return null
  ratesCache = { rates: res.data.rates, updated: res.data.time_last_update_utc ?? '', expires: Date.now() + 12 * 3_600_000 }
  return ratesCache
}

export const ATTRIBUTIONS = {
  weather: { text: 'Weather data from MET Norway', url: 'https://api.met.no/' },
  places: { text: 'Places from Wikipedia', url: 'https://www.wikipedia.org/' },
  currency: { text: 'Rates by Exchange Rate API', url: 'https://www.exchangerate-api.com' },
  geocoding: { text: 'Locations © OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' },
} as const
export type Attribution = (typeof ATTRIBUTIONS)[keyof typeof ATTRIBUTIONS]

// Pure helpers behind the assistant's account-wide and "around your trip"
// tools — which trip the user means, local time, weather summaries, and
// currency maths. No network here (that's lib/voice/around.ts), so all of
// it is unit-tested (aroundPure.test.ts).
import type { VoiceAccountContext, VoiceTripSummary } from './types'

// ------------------------------------------------------------ which trip

export type TripResolveResult =
  | { type: 'found'; trip: VoiceTripSummary }
  | { type: 'ambiguous'; candidates: VoiceTripSummary[] }
  | { type: 'not_found' }
  | { type: 'none_in_focus'; candidates: VoiceTripSummary[] }

const UPCOMING_STATUSES = new Set(['UPCOMING', 'ACTIVE'])

/**
 * Which trip a request is about. An explicit name wins; otherwise the trip
 * whose page the user is on; otherwise their only active/upcoming trip.
 * Never guesses between several — the caller asks, with the real options.
 */
export function resolveTrip(account: VoiceAccountContext, query: string | undefined): TripResolveResult {
  const trips = account.trips
  const q = query?.trim().toLowerCase()
  if (q) {
    if (q === 'next' || q === 'upcoming' || q === 'current') {
      const soonest = trips
        .filter((t) => UPCOMING_STATUSES.has(t.status))
        .sort((a, b) => (a.startsAt?.getTime() ?? Infinity) - (b.startsAt?.getTime() ?? Infinity))[0]
      return soonest ? { type: 'found', trip: soonest } : { type: 'not_found' }
    }
    const exact = trips.filter((t) => t.title.toLowerCase() === q || t.id === query)
    if (exact.length === 1) return { type: 'found', trip: exact[0] }
    const words = q.split(/\s+/).filter((w) => w.length > 2 && !['trip', 'the', 'my', 'to', 'our'].includes(w))
    const matches = trips.filter((t) => {
      const title = t.title.toLowerCase()
      return title.includes(q) || (words.length > 0 && words.every((w) => title.includes(w)))
    })
    if (matches.length === 1) return { type: 'found', trip: matches[0] }
    if (matches.length > 1) return { type: 'ambiguous', candidates: matches }
    return { type: 'not_found' }
  }
  const page = account.pageTripId ? trips.find((t) => t.id === account.pageTripId) : undefined
  if (page) return { type: 'found', trip: page }
  const live = trips.filter((t) => UPCOMING_STATUSES.has(t.status))
  if (live.length === 1) return { type: 'found', trip: live[0] }
  return { type: 'none_in_focus', candidates: live.length ? live : trips }
}

// ------------------------------------------------------------ local time

/**
 * An IANA zone for a spoken place name ("Montego Bay" won't match, "Jamaica"
 * and "New York" will) — only from the runtime's own zone list, so it never
 * invents one. Null when there's no confident match.
 */
export function zoneForPlaceName(name: string, zones: readonly string[] = supportedZones()): string | null {
  const q = name.trim().toLowerCase().replace(/\s+/g, '_')
  if (!q) return null
  const exact = zones.find((z) => z.toLowerCase() === q)
  if (exact) return exact
  const byCity = zones.filter((z) => z.split('/').pop()!.toLowerCase() === q)
  return byCity.length === 1 ? byCity[0] : null
}

function supportedZones(): readonly string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  return intl.supportedValuesOf ? intl.supportedValuesOf('timeZone') : []
}

/** Minutes the zone is ahead of UTC at `at`. */
export function utcOffsetMinutes(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return Math.round((Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000)
}

export function localTimeReport(zone: string, homeZone: string | null, now: Date) {
  const fmt = (z: string) => new Intl.DateTimeFormat('en-US', { timeZone: z, weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(now)
  const result: { zone: string; localTime: string; homeZone: string | null; homeTime: string | null; hoursAheadOfHome: number | null } = {
    zone,
    localTime: fmt(zone),
    homeZone,
    homeTime: homeZone ? fmt(homeZone) : null,
    hoursAheadOfHome: null,
  }
  if (homeZone) result.hoursAheadOfHome = (utcOffsetMinutes(zone, now) - utcOffsetMinutes(homeZone, now)) / 60
  return result
}

// --------------------------------------------------------------- weather

/** One entry of MET Norway's Locationforecast 2.0 "compact" timeseries — only the fields used. */
export interface MetTimeseriesEntry {
  time: string
  data: {
    instant: { details: { air_temperature?: number; wind_speed?: number } }
    next_1_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } }
    next_6_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } }
  }
}

const SYMBOL_WORDS: Record<string, string> = {
  clearsky: 'clear skies', fair: 'mostly clear', partlycloudy: 'partly cloudy', cloudy: 'cloudy', fog: 'fog',
  lightrain: 'light rain', rain: 'rain', heavyrain: 'heavy rain',
  lightrainshowers: 'light showers', rainshowers: 'showers', heavyrainshowers: 'heavy showers',
  lightrainandthunder: 'light rain and thunder', rainandthunder: 'rain and thunder', heavyrainandthunder: 'heavy rain and thunder',
  lightrainshowersandthunder: 'showers and thunder', rainshowersandthunder: 'showers and thunder', heavyrainshowersandthunder: 'heavy showers and thunder',
  lightsleet: 'light sleet', sleet: 'sleet', heavysleet: 'heavy sleet', lightsnow: 'light snow', snow: 'snow', heavysnow: 'heavy snow',
  lightsnowshowers: 'light snow showers', snowshowers: 'snow showers', heavysnowshowers: 'heavy snow showers',
}

/** "partlycloudy_day" -> "partly cloudy". Unknown codes fall back to the code without its day/night suffix. */
export function describeSymbol(code: string | undefined): string | null {
  if (!code) return null
  const base = code.replace(/_(day|night|polartwilight)$/, '')
  return SYMBOL_WORDS[base] ?? base
}

export interface WeatherSummary {
  /** The day summarised, in the place's local sense (YYYY-MM-DD). */
  date: string
  lowC: number
  highC: number
  /** The conditions most often forecast that day. */
  conditions: string | null
  totalRainMm: number
  maxWindKmh: number
}

/**
 * Summarises one local day of a MET Norway forecast. `utcOffsetHours` maps
 * the place's local day onto UTC (from its zone when known, otherwise
 * estimated from longitude). Null when the forecast doesn't reach that day.
 */
export function summarizeForecastDay(series: MetTimeseriesEntry[], date: string, utcOffsetHours: number): WeatherSummary | null {
  const start = Date.parse(`${date}T00:00:00Z`) - utcOffsetHours * 3_600_000
  const end = start + 24 * 3_600_000
  const day = series.filter((e) => {
    const t = Date.parse(e.time)
    return t >= start && t < end
  })
  if (day.length < 3) return null
  const temps = day.map((e) => e.data.instant.details.air_temperature).filter((t): t is number => typeof t === 'number')
  const winds = day.map((e) => e.data.instant.details.wind_speed).filter((w): w is number => typeof w === 'number')
  const counts = new Map<string, number>()
  for (const e of day) {
    const c = describeSymbol(e.data.next_1_hours?.summary?.symbol_code ?? e.data.next_6_hours?.summary?.symbol_code)
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  // Hourly rows carry next_1_hours; the sparser 6-hourly tail only has next_6_hours.
  const hourly = day.filter((e) => e.data.next_1_hours?.details?.precipitation_amount !== undefined)
  const rain = hourly.length
    ? hourly.reduce((sum, e) => sum + (e.data.next_1_hours!.details!.precipitation_amount ?? 0), 0)
    : day.reduce((sum, e) => sum + (e.data.next_6_hours?.details?.precipitation_amount ?? 0), 0)
  if (temps.length === 0) return null
  return {
    date,
    lowC: Math.round(Math.min(...temps)),
    highC: Math.round(Math.max(...temps)),
    conditions: [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    totalRainMm: Math.round(rain * 10) / 10,
    maxWindKmh: winds.length ? Math.round(Math.max(...winds) * 3.6) : 0,
  }
}

export const cToF = (c: number) => Math.round((c * 9) / 5 + 32)

// -------------------------------------------------------------- currency

/** Converts using rates quoted against one base currency (rate = units per 1 base). */
export function convertCurrency(amount: number, from: string, to: string, rates: Record<string, number>): number | null {
  const f = rates[from.toUpperCase()]
  const t = rates[to.toUpperCase()]
  if (!f || !t || !Number.isFinite(amount)) return null
  return (amount / f) * t
}

/** Rounded for speaking: whole units for big numbers, cents otherwise. */
export function roundMoney(value: number): number {
  return value >= 1000 ? Math.round(value) : Math.round(value * 100) / 100
}

// Impure — executors for the "around your trip" tools (weather, nearby
// places, currency). Location choice is deterministic: a segment means its
// destination (where the user will be), an airport code resolves from the
// bundled table, anything else is geocoded. Every result names its source,
// and each source's attribution is surfaced in the chat (see agent.ts).
import { lookupAirport } from '@/lib/data/airports'
import { segmentLabel } from '@/lib/segmentLabel'
import { resolveSegmentZones, utcToZonedDateTimeParts } from '@/lib/dateFormat'
import type { LatLng } from '@/lib/map/geo'
import { resolveSegment } from './resolveSegment'
import { segmentZone } from './toolExecutors'
import { zoneForPlaceName, utcOffsetMinutes, summarizeForecastDay, cToF, convertCurrency, roundMoney } from './aroundPure'
import { geocode, forecastAt, placesNear, usdRates, ATTRIBUTIONS, type Attribution } from './around'
import type { VoiceAccountContext, VoiceContext, VoiceSegment } from './types'

export type AroundResult = { result: Record<string, unknown>; attributions: Attribution[] }

interface PlaceArgs {
  place?: string
  segment?: string
}

type ResolvedPlace = { point: LatLng; label: string; zone: string | null; defaultDate: string | null; attributions: Attribution[] }

const fail = (message: string): AroundResult => ({ result: { found: false, message }, attributions: [] })

/** A segment's destination point (or the place itself for a hotel/restaurant). */
async function segmentPoint(s: VoiceSegment): Promise<{ point: LatLng | null; geocoded: boolean }> {
  for (const code of [s.arrivalLocationCode, s.departureLocationCode]) {
    const airport = code ? lookupAirport(code) : null
    if (airport) return { point: { lat: airport.lat, lng: airport.lng }, geocoded: false }
  }
  for (const text of [s.arrivalLocation, s.departureLocation]) {
    if (text?.trim()) {
      const p = await geocode(text)
      if (p) return { point: p, geocoded: true }
    }
  }
  return { point: null, geocoded: false }
}

async function resolvePlace(account: VoiceAccountContext, trip: VoiceContext | null, args: PlaceArgs): Promise<ResolvedPlace | AroundResult> {
  if (args.segment) {
    if (!trip) return fail('Which trip is that segment on?')
    const r = resolveSegment(trip.segments, args.segment, account.now)
    if (r.type === 'not_found') return fail(`No segment matched "${args.segment}".`)
    if (r.type === 'ambiguous') return { result: { found: false, message: 'Several segments match — ask which one.', candidates: r.candidates.map((c) => segmentLabel(c)) }, attributions: [] }
    const { point, geocoded } = await segmentPoint(r.segment)
    if (!point) return fail(`${segmentLabel(r.segment)} has no airport code or address Maestravl can locate.`)
    const zone = segmentZone(r.segment)
    const when = r.segment.arrivalTime ?? r.segment.departureTime
    const zones = resolveSegmentZones(r.segment)
    return {
      point,
      label: r.segment.arrivalLocation || r.segment.departureLocation || segmentLabel(r.segment),
      zone,
      defaultDate: when ? utcToZonedDateTimeParts(when, zones.arrival ?? zones.departure).date : null,
      attributions: geocoded ? [ATTRIBUTIONS.geocoding] : [],
    }
  }
  if (args.place) {
    const code = args.place.trim()
    const airport = code.length === 3 && /^[A-Za-z]+$/.test(code) ? lookupAirport(code) : null
    if (airport) return { point: { lat: airport.lat, lng: airport.lng }, label: `${airport.city} (${code.toUpperCase()})`, zone: airport.timezone, defaultDate: null, attributions: [] }
    const point = await geocode(args.place)
    if (!point) return fail(`Couldn't find "${args.place}" on the map (or the map lookup is unavailable right now).`)
    return { point, label: args.place, zone: zoneForPlaceName(args.place), defaultDate: null, attributions: [ATTRIBUTIONS.geocoding] }
  }
  return fail('Ask which place, or which segment of the trip, they mean.')
}

const isFailure = (r: ResolvedPlace | AroundResult): r is AroundResult => 'result' in r

export async function executeWeather(account: VoiceAccountContext, trip: VoiceContext | null, args: PlaceArgs & { date?: string }): Promise<AroundResult> {
  const place = await resolvePlace(account, trip, args)
  if (isFailure(place)) return place
  const today = place.zone ? utcToZonedDateTimeParts(account.now, place.zone).date : account.now.toISOString().slice(0, 10)
  const date = args.date ?? (place.defaultDate && place.defaultDate >= today ? place.defaultDate : today)
  // Local day boundaries: from the zone when known, otherwise estimated from longitude.
  const offsetHours = place.zone ? utcOffsetMinutes(place.zone, new Date(`${date}T12:00:00Z`)) / 60 : Math.round(place.point.lng / 15)

  const series = await forecastAt(place.point)
  if (!series) return { result: { found: false, message: 'The weather service is unavailable right now — try again shortly.' }, attributions: place.attributions }
  const day = summarizeForecastDay(series, date, offsetHours)
  if (!day) {
    return {
      result: { found: false, place: place.label, date, message: 'No forecast that far ahead yet — forecasts reach about 9 days out. Offer to check closer to the date.' },
      attributions: [...place.attributions, ATTRIBUTIONS.weather],
    }
  }
  return {
    result: {
      found: true,
      place: place.label,
      date,
      highC: day.highC,
      highF: cToF(day.highC),
      lowC: day.lowC,
      lowF: cToF(day.lowC),
      conditions: day.conditions,
      rainMm: day.totalRainMm,
      maxWindKmh: day.maxWindKmh,
      note: 'A forecast, not a guarantee. Give both Celsius and Fahrenheit unless the user prefers one.',
    },
    attributions: [...place.attributions, ATTRIBUTIONS.weather],
  }
}

export async function executeNearbyPlaces(account: VoiceAccountContext, trip: VoiceContext | null, args: PlaceArgs): Promise<AroundResult> {
  const place = await resolvePlace(account, trip, args)
  if (isFailure(place)) return place
  const places = await placesNear(place.point)
  if (!places) return { result: { found: false, message: 'The places lookup is unavailable right now.' }, attributions: place.attributions }
  if (places.length === 0) return { result: { found: true, near: place.label, places: [], message: 'No notable places listed within about 5 km.' }, attributions: [...place.attributions, ATTRIBUTIONS.places] }
  return { result: { found: true, near: place.label, places: places.map((p) => ({ name: p.title, kmAway: p.distanceKm })) }, attributions: [...place.attributions, ATTRIBUTIONS.places] }
}

export async function executeConvertCurrency(args: { amount: number; from: string; to: string }): Promise<AroundResult> {
  const rates = await usdRates()
  if (!rates) return fail('Exchange rates are unavailable right now.')
  const value = convertCurrency(args.amount, args.from, args.to, rates.rates)
  if (value === null) return fail(`I don't have a rate for ${args.from.toUpperCase()} or ${args.to.toUpperCase()}.`)
  return {
    result: {
      found: true,
      amount: args.amount,
      from: args.from.toUpperCase(),
      to: args.to.toUpperCase(),
      converted: roundMoney(value),
      ratesUpdated: rates.updated,
      note: 'Daily mid-market rate; banks and exchange counters charge more. Say "about".',
    },
    attributions: [ATTRIBUTIONS.currency],
  }
}

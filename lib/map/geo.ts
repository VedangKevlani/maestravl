// Pure geometry + proximity reasoning for the trip map
// (app/components/map/TripMapView.tsx). No network, no DOM — every rule
// here is deterministic and unit-tested (geo.test.ts).
//
// Honesty rules this module follows, because a map invites people to trust
// what they see:
// - A vehicle's position is an ESTIMATE from its schedule (how far along
//   departure→arrival "now" is), never presented as live radar. No free
//   source gives live positions for arbitrary trains/buses, and for flights
//   the free option (OpenSky) needs the aircraft's transponder id, which an
//   itinerary doesn't contain.
// - "Leave by" advice uses straight-line distance and rough speeds. It's a
//   nudge to check directions, labelled as such, never a promise.

export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_KM = 6371
const toRad = (d: number) => (d * Math.PI) / 180
const toDeg = (r: number) => (r * 180) / Math.PI

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** The point a fraction `f` (0..1) of the way along the great circle from a to b. */
export function interpolateGreatCircle(a: LatLng, b: LatLng, f: number): LatLng {
  const φ1 = toRad(a.lat), λ1 = toRad(a.lng), φ2 = toRad(b.lat), λ2 = toRad(b.lng)
  const δ = haversineKm(a, b) / EARTH_RADIUS_KM
  if (δ < 1e-9) return { ...a }
  const A = Math.sin((1 - f) * δ) / Math.sin(δ)
  const B = Math.sin(f * δ) / Math.sin(δ)
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2)
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2)
  const z = A * Math.sin(φ1) + B * Math.sin(φ2)
  return { lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), lng: toDeg(Math.atan2(y, x)) }
}

/**
 * [lng, lat] points along a route for drawing: a great-circle arc for
 * flights (what a plane actually flies), a straight line for ground legs.
 * Longitudes are unwrapped so a route crossing the antimeridian draws as
 * one short arc instead of a line across the whole world.
 */
export function routeLine(a: LatLng, b: LatLng, curved: boolean, steps = 64): [number, number][] {
  const raw = curved ? Array.from({ length: steps + 1 }, (_, i) => interpolateGreatCircle(a, b, i / steps)) : [a, b]
  const out: [number, number][] = []
  let prevLng: number | null = null
  for (const p of raw) {
    let lng = p.lng
    if (prevLng !== null) {
      while (lng - prevLng > 180) lng -= 360
      while (lng - prevLng < -180) lng += 360
    }
    out.push([lng, p.lat])
    prevLng = lng
  }
  return out
}

/** How far through its scheduled window a segment is right now (0..1), or null outside it. */
export function scheduleProgress(departure: Date | null, arrival: Date | null, now: Date): number | null {
  if (!departure || !arrival) return null
  const total = arrival.getTime() - departure.getTime()
  if (total <= 0) return null
  const f = (now.getTime() - departure.getTime()) / total
  return f >= 0 && f <= 1 ? f : null
}

// ------------------------------------------------------------- proximity

export interface MapSegment {
  id: string
  label: string
  transportType: string
  status: string
  departureTime: Date | null
  arrivalTime: Date | null
  /** Where it starts (or the place itself, for a hotel/restaurant). */
  from: LatLng | null
  /** Where it ends — null for single-place segments. */
  to: LatLng | null
}

/** Minutes to be at the starting point before departure — typical guidance, not airline policy. */
const ARRIVE_EARLY_MINUTES: Record<string, number> = {
  FLIGHT: 120,
  TRAIN: 20,
  BUS: 15,
  FERRY: 45,
  CRUISE: 90,
  BOAT: 20,
  HELICOPTER: 30,
  RESTAURANT: 5,
  HOTEL: 0,
}
const DEFAULT_ARRIVE_EARLY_MINUTES = 10
// Straight-line distance understates real road distance; ~1.3x and ~40
// km/h door-to-door is a common rough urban figure.
const ROAD_FACTOR = 1.3
const GROUND_SPEED_KMH = 40
/** Beyond this, the passenger clearly isn't about to travel there by road — no "leave by" advice. */
const MAX_GROUND_ADVICE_KM = 250
/** How close counts as "at" a place. */
const AT_PLACE_KM = 0.4
/** How close to an in-progress vehicle's estimated position counts as "probably aboard". */
const ABOARD_KM = 120

export type LeaveVerdict = 'plenty_of_time' | 'leave_soon' | 'cutting_it_close' | 'too_far_to_advise'

export interface ProximityReport {
  /** A segment underway right now, and whether the passenger seems to be on it. */
  current: { segmentId: string; estimatedPosition: LatLng | null; probablyAboard: boolean | null } | null
  /** The next segment to start within 24h, with rough "when to leave" advice. */
  next: {
    segmentId: string
    distanceKm: number
    minutesUntilStart: number
    travelMinutes: number
    /** Minutes from now the passenger should set off (negative = already late by that much). */
    leaveInMinutes: number
    verdict: LeaveVerdict
  } | null
  /** The closest trip place to the passenger, if they're near one. */
  atPlace: { segmentId: string; role: 'from' | 'to'; distanceKm: number } | null
}

function isTravel(type: string) {
  return !['HOTEL', 'RESTAURANT', 'EXCURSION', 'OTHER'].includes(type)
}

export function proximityReport(segments: MapSegment[], user: LatLng | null, now: Date): ProximityReport {
  // Underway now (a travel leg between its scheduled times).
  let current: ProximityReport['current'] = null
  for (const s of segments) {
    if (!isTravel(s.transportType) || s.status === 'CANCELLED') continue
    const f = scheduleProgress(s.departureTime, s.arrivalTime, now)
    if (f === null) continue
    const estimatedPosition = s.from && s.to ? interpolateGreatCircle(s.from, s.to, f) : null
    current = {
      segmentId: s.id,
      estimatedPosition,
      probablyAboard: user && estimatedPosition ? haversineKm(user, estimatedPosition) <= ABOARD_KM : null,
    }
    break
  }

  // Next to start, within a day.
  const upcoming = segments
    .filter((s) => s.from && s.departureTime && s.status !== 'CANCELLED')
    .filter((s) => {
      const mins = (s.departureTime!.getTime() - now.getTime()) / 60_000
      return mins > 0 && mins <= 24 * 60
    })
    .sort((a, b) => a.departureTime!.getTime() - b.departureTime!.getTime())[0]

  let next: ProximityReport['next'] = null
  if (upcoming && user) {
    const distanceKm = haversineKm(user, upcoming.from!)
    const minutesUntilStart = Math.round((upcoming.departureTime!.getTime() - now.getTime()) / 60_000)
    const travelMinutes = Math.round(((distanceKm * ROAD_FACTOR) / GROUND_SPEED_KMH) * 60)
    const early = ARRIVE_EARLY_MINUTES[upcoming.transportType] ?? DEFAULT_ARRIVE_EARLY_MINUTES
    const leaveInMinutes = minutesUntilStart - early - travelMinutes
    const verdict: LeaveVerdict =
      distanceKm > MAX_GROUND_ADVICE_KM ? 'too_far_to_advise' : leaveInMinutes < 0 ? 'cutting_it_close' : leaveInMinutes <= 30 ? 'leave_soon' : 'plenty_of_time'
    next = { segmentId: upcoming.id, distanceKm, minutesUntilStart, travelMinutes, leaveInMinutes, verdict }
  }

  let atPlace: ProximityReport['atPlace'] = null
  if (user) {
    for (const s of segments) {
      for (const role of ['from', 'to'] as const) {
        const p = s[role]
        if (!p) continue
        const d = haversineKm(user, p)
        if (d <= AT_PLACE_KM && (!atPlace || d < atPlace.distanceKm)) atPlace = { segmentId: s.id, role, distanceKm: d }
      }
    }
  }

  return { current, next, atPlace }
}

/** "350 m" / "4.2 km" / "1,240 km". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km).toLocaleString('en-US')} km`
}

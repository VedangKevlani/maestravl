// "Get an Uber there" — a deep link into Uber's own app/website with
// pickup/dropoff prefilled, not a real booking. Maestravl has no payment
// infrastructure anywhere and Uber's actual APIs (Riders API, Guest Rides)
// only know about rides Uber itself created, so they can't check the
// status of a ride booked some other way — a deep link is the honest,
// zero-liability version of "help the passenger get to their next segment"
// (same "propose, don't act" shape as lib/agents/message.ts's reschedule
// requests, which ask rather than claim to book).
//
// Pure — no network/DOM access — so it's usable from both a server
// component and SegmentCard.tsx (a client component), and unit-testable.
//
// Uses NEXT_PUBLIC_UBER_CLIENT_ID rather than a server-only var (unlike
// every other isXConfigured() in this codebase, e.g. lib/voice/tts.ts) —
// it needs to run client-side, and unlike a real API key this client_id
// isn't a secret: it's a plain GET parameter, visible in the link itself
// the moment someone clicks it, so bundling it costs nothing.
//
// The exact URL format was confirmed by reading Uber's own developer docs
// (https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/introduction)
// as of 2026-08, but a secondary source referenced a different path
// (m.uber.com/ul/?action=setPickup...) — going with what Uber's own docs
// page showed (m.uber.com/looking), but this hasn't been confirmed against
// a live click-through (no client_id was available while building this).
import { lookupAirport } from './data/airports'

const DEEP_LINK_BASE = 'https://m.uber.com/looking'

export function isUberConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_UBER_CLIENT_ID)
}

interface LocatableSegment {
  departureLocation: string | null
  departureLocationCode: string | null
  arrivalLocation: string | null
  arrivalLocationCode: string | null
}

/**
 * Best-effort human-readable (and Uber-app-geocodable) text for one end of
 * a segment. Prefers whatever free-text location the extraction pipeline
 * or a manual edit already captured, falls back to the curated airport
 * dictionary, then the bare code — returns null rather than fabricating a
 * location when nothing is available.
 */
export function locationText(segment: LocatableSegment, which: 'departure' | 'arrival'): string | null {
  const location = which === 'departure' ? segment.departureLocation : segment.arrivalLocation
  const code = which === 'departure' ? segment.departureLocationCode : segment.arrivalLocationCode

  if (location) return code ? `${location} (${code})` : location
  if (code) {
    const airport = lookupAirport(code)
    return airport ? `${airport.name} (${code})` : code
  }
  return null
}

/**
 * Builds the Uber deep-link URL from plain address text (no coordinates —
 * Maestravl doesn't have any). Uber's own app resolves an address string
 * when the link opens, the same as typing it into the address bar.
 */
export function buildUberDeepLink(opts: { clientId: string; pickup: string; dropoff: string }): string {
  const url = new URL(DEEP_LINK_BASE)
  url.searchParams.set('client_id', opts.clientId)
  url.searchParams.set('pickup', JSON.stringify({ addressLine2: opts.pickup }))
  url.searchParams.set('drop[0]', JSON.stringify({ addressLine2: opts.dropoff }))
  return url.toString()
}

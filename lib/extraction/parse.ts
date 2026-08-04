import * as chrono from 'chrono-node'
import { lookupAirline } from '@/lib/data/airlines'
import { lookupAirport } from '@/lib/data/airports'
import {
  field,
  type ExtractedField,
  type ExtractedItinerary,
  type ExtractedSegment,
  type TransportTypeGuess,
} from './types'

function emptySegment(transportType: TransportTypeGuess, transportConfidence: number): ExtractedSegment {
  return {
    transportType: field(transportType, transportConfidence, 'heuristic'),
    provider: field<string>(null, 0, 'unset'),
    identifier: field<string>(null, 0, 'unset'),
    confirmationNumber: field<string>(null, 0, 'unset'),
    ticketNumber: field<string>(null, 0, 'unset'),
    departureLocation: field<string>(null, 0, 'unset'),
    departureLocationCode: field<string>(null, 0, 'unset'),
    departureTerminal: field<string>(null, 0, 'unset'),
    departureGate: field<string>(null, 0, 'unset'),
    departureTime: field<string>(null, 0, 'unset'),
    arrivalLocation: field<string>(null, 0, 'unset'),
    arrivalLocationCode: field<string>(null, 0, 'unset'),
    arrivalTerminal: field<string>(null, 0, 'unset'),
    arrivalTime: field<string>(null, 0, 'unset'),
    seat: field<string>(null, 0, 'unset'),
    cabin: field<string>(null, 0, 'unset'),
    travelClass: field<string>(null, 0, 'unset'),
    currency: field<string>(null, 0, 'unset'),
    price: field<number>(null, 0, 'unset'),
    baggageInfo: field<string>(null, 0, 'unset'),
    notes: field<string>(null, 0, 'unset'),
  }
}

// Two-letter prefix (AA123, BW406, JM114...) — the overwhelmingly common
// format, safe to accept without dictionary confirmation.
const FLIGHT_NUMBER_STRICT_RE = /\b([A-Z]{2})\s?-?\s?(\d{2,4})\b/g
// Letter+digit or digit+letter prefixes (B6, 3M, 4O...) are real IATA codes
// for some carriers, but that shape also matches incidental things like gate
// numbers ("B12") — only accept these when the prefix is a KNOWN airline.
const FLIGHT_NUMBER_LOOSE_RE = /\b([A-Z][0-9]|[0-9][A-Z])\s?-?\s?(\d{1,4})\b/g
const AIRPORT_CODE_RE = /\b([A-Z]{3})\b/g
const CONFIRMATION_RE = /(?:booking reference|confirmation(?: number| code)?|record locator|pnr)[:\s#-]*\s*([A-Z0-9]{5,8})\b/gi
const TICKET_RE = /ticket(?:\s*number)?[:\s#-]*\s*([A-Z0-9-]{6,15})\b/gi
const SEAT_RE = /seat[:\s#-]*\s*(\d{1,3}[A-Z])\b/i
const GATE_RE = /gate[:\s#-]*\s*([A-Z0-9]{1,4})\b/gi
const TERMINAL_RE = /terminal[:\s#-]*\s*([A-Z0-9]{1,3})\b/gi
const CABIN_RE = /\b(economy|premium economy|business|first)\s*class\b|\bcabin[:\s]*(\w+)/i
const PRICE_RE = /(USD|EUR|GBP|JMD|CAD|\$|€|£)\s?([\d,]+\.\d{2})/
const CURRENCY_SYMBOLS: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP' }

const TRANSPORT_KEYWORDS: [RegExp, TransportTypeGuess][] = [
  [/\btrain\b|\brailway\b|\bamtrak\b/i, 'TRAIN'],
  [/\bbus\b|\bcoach\b|\bgreyhound\b/i, 'BUS'],
  [/\btaxi\b|\bcab\b|\brideshare\b|\buber\b|\blyft\b/i, 'TAXI'],
  [/\bferry\b/i, 'FERRY'],
  [/\bcruise\b/i, 'CRUISE'],
  [/\bboat\b|\bcharter\b/i, 'BOAT'],
  [/\bhelicopter\b/i, 'HELICOPTER'],
  [/\bbicycle\b|\bbike rental\b/i, 'BICYCLE'],
  [/\brental car\b|\bcar rental\b/i, 'RENTAL_CAR'],
  [/\bhotel\b|\bcheck-?in\b|\bresort\b/i, 'HOTEL'],
  [/\brestaurant\b|\breservation for dinner\b/i, 'RESTAURANT'],
  [/\bexcursion\b|\btour\b/i, 'EXCURSION'],
]

function guessTransportType(scope: string): { type: TransportTypeGuess; confidence: number } {
  for (const [re, type] of TRANSPORT_KEYWORDS) {
    if (re.test(scope)) return { type, confidence: 65 }
  }
  return { type: 'OTHER', confidence: 30 }
}

/** Finds flight-number-like tokens (airline prefix + digits), scored higher when the prefix is a known carrier. */
function findFlightAnchors(text: string): { identifier: string; provider: string | null; confidence: number; index: number }[] {
  const anchors: { identifier: string; provider: string | null; confidence: number; index: number }[] = []
  const seenIndexes = new Set<number>()

  for (const m of text.matchAll(FLIGHT_NUMBER_STRICT_RE)) {
    const prefix = m[1].toUpperCase()
    const digits = m[2]
    const airline = lookupAirline(prefix)
    const index = m.index ?? 0
    seenIndexes.add(index)
    anchors.push({ identifier: `${prefix}${digits}`, provider: airline, confidence: airline ? 95 : 60, index })
  }

  // Ambiguous letter+digit / digit+letter prefixes (B6, 3M...) only count as
  // a flight if the prefix is a carrier we actually recognize — otherwise
  // things like "Gate: B12" get misread as a second flight.
  for (const m of text.matchAll(FLIGHT_NUMBER_LOOSE_RE)) {
    const index = m.index ?? 0
    if (seenIndexes.has(index)) continue
    const prefix = m[1].toUpperCase()
    const digits = m[2]
    const airline = lookupAirline(prefix)
    if (!airline) continue
    anchors.push({ identifier: `${prefix}${digits}`, provider: airline, confidence: 95, index })
  }

  anchors.sort((a, b) => a.index - b.index)

  // The same flight is often mentioned more than once in one document (a
  // structured itinerary block, then a prose "day of travel" recap that
  // restates the flight number) — only the first mention should become a
  // segment, or the recap gets misread as a connecting/return flight.
  const seenIdentifiers = new Set<string>()
  return anchors.filter((a) => {
    if (seenIdentifiers.has(a.identifier)) return false
    seenIdentifiers.add(a.identifier)
    return true
  })
}

/** Finds up to two dictionary-known airport codes in a text window, in order of appearance. */
function findAirportCodesInScope(scope: string): { code: string; confidence: number; index: number }[] {
  const found: { code: string; confidence: number; index: number }[] = []
  const seen = new Set<number>()
  for (const m of scope.matchAll(AIRPORT_CODE_RE)) {
    const code = m[1]
    if (!lookupAirport(code)) continue
    const idx = m.index ?? 0
    if (seen.has(idx)) continue
    seen.add(idx)
    found.push({ code, confidence: 90, index: idx })
  }
  return found
}

function findPassengerNames(text: string): ExtractedField<string>[] {
  const results: ExtractedField<string>[] = []
  const seen = new Set<string>()

  // "LASTNAME/FIRSTNAME MR" style PNR format
  for (const m of text.matchAll(/\b([A-Z]{2,})\/([A-Z]{2,})(?:\s+(MR|MRS|MS|MISS|DR))?\b/g)) {
    const name = `${m[2]} ${m[1]}`
    const key = name.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    results.push(field(toTitleCase(name), 90, 'regex'))
  }

  // "Passenger: John Smith" / "Traveler Name: Jane Doe" style. Uses [ \t]
  // rather than \s between name words so the match can't run past a line
  // break onto unrelated text on the next line (e.g. "Passenger: John Smith\nFlight AA123").
  for (const m of text.matchAll(/(?:passenger|traveler|traveller|guest)s?(?:[ \t]*name)?[ \t]*[:\-][ \t]*([A-Za-z][A-Za-z'\-]+(?:[ \t]+[A-Za-z][A-Za-z'\-]+){1,3})/gi)) {
    const name = m[1].trim()
    const key = name.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    results.push(field(toTitleCase(name), 80, 'regex'))
  }

  return results
}

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

// These labels (ticket/confirmation/gate/terminal) are matched case-insensitively
// so "TICKET NUMBER" and "Ticket Number" both work, but that /i flag also makes
// the *value* capture group case-insensitive — which lets it match ordinary
// lowercase prose (e.g. "Electronic Ticket Passenger Itinerary" capturing
// "Passenger", or "Gates D30" capturing a stray "s"). Real codes are written
// in caps in these documents, so require the captured text to already be
// all-caps rather than trusting the match and calling .toUpperCase() on it.
function isAlreadyUpperCase(value: string): boolean {
  return value === value.toUpperCase()
}

/**
 * Returns the first regex match (across all occurrences of the label in the
 * text) whose captured value is already all-caps — skipping label mentions
 * that happened to capture ordinary lowercase prose instead of a real code,
 * rather than giving up as soon as the first occurrence turns out to be bogus.
 */
function firstValidUpperCaseMatch(text: string, re: RegExp): string | null {
  for (const m of text.matchAll(re)) {
    if (isAlreadyUpperCase(m[1])) return m[1]
  }
  return null
}

function findConfirmationNumber(text: string): ExtractedField<string> {
  const value = firstValidUpperCaseMatch(text, CONFIRMATION_RE)
  return value ? field(value, 88, 'regex') : field<string>(null, 0, 'unset')
}

function findTicketNumber(scope: string): ExtractedField<string> {
  const value = firstValidUpperCaseMatch(scope, TICKET_RE)
  return value ? field(value, 85, 'regex') : field<string>(null, 0, 'unset')
}

function findSeat(scope: string): ExtractedField<string> {
  const m = scope.match(SEAT_RE)
  return m ? field(m[1].toUpperCase(), 90, 'regex') : field<string>(null, 0, 'unset')
}

function findGate(scope: string): ExtractedField<string> {
  const value = firstValidUpperCaseMatch(scope, GATE_RE)
  return value ? field(value, 82, 'regex') : field<string>(null, 0, 'unset')
}

function findTerminal(scope: string): ExtractedField<string> {
  const value = firstValidUpperCaseMatch(scope, TERMINAL_RE)
  return value ? field(value, 82, 'regex') : field<string>(null, 0, 'unset')
}

function findCabin(scope: string): ExtractedField<string> {
  const m = scope.match(CABIN_RE)
  const value = m ? (m[1] || m[2]) : null
  return value ? field(toTitleCase(value), 75, 'regex') : field<string>(null, 0, 'unset')
}

function findPrice(scope: string): { price: ExtractedField<number>; currency: ExtractedField<string> } {
  const m = scope.match(PRICE_RE)
  if (!m) return { price: field<number>(null, 0, 'unset'), currency: field<string>(null, 0, 'unset') }
  const rawCurrency = m[1]
  const currency = CURRENCY_SYMBOLS[rawCurrency] ?? rawCurrency.toUpperCase()
  const amount = parseFloat(m[2].replace(/,/g, ''))
  return {
    price: field(amount, 85, 'regex'),
    currency: field(currency, 85, 'regex'),
  }
}

/** Uses chrono-node (free, MIT) to find date/time mentions within a text window. */
function findDateTimes(scope: string, referenceDate: Date): { departure: ExtractedField<string>; arrival: ExtractedField<string> } {
  const results = chrono.parse(scope, referenceDate, { forwardDate: true })
  if (results.length === 0) {
    return { departure: field<string>(null, 0, 'unset'), arrival: field<string>(null, 0, 'unset') }
  }
  const toIso = (r: chrono.ParsedResult) => r.start.date().toISOString()
  const hasTime = (r: chrono.ParsedResult) => r.start.isCertain('hour')
  const dep = results[0]
  const arr = results[1]
  return {
    departure: field(toIso(dep), hasTime(dep) ? 80 : 55, 'nlp-date'),
    arrival: arr ? field(toIso(arr), hasTime(arr) ? 80 : 55, 'nlp-date') : field<string>(null, 0, 'unset'),
  }
}

const SCOPE_RADIUS = 350

function sliceScope(text: string, index: number, nextIndex: number | null): string {
  const start = Math.max(0, index - SCOPE_RADIUS)
  const end = nextIndex !== null ? Math.min(text.length, nextIndex) : Math.min(text.length, index + SCOPE_RADIUS * 2)
  return text.slice(start, end)
}

export function parseItinerary(rawText: string, referenceDate: Date = new Date()): ExtractedItinerary {
  const text = rawText.replace(/\r/g, '')
  const passengerNames = findPassengerNames(text)
  const confirmationNumber = findConfirmationNumber(text)

  const flightAnchors = findFlightAnchors(text)
  const segments: ExtractedSegment[] = []

  if (flightAnchors.length > 0) {
    flightAnchors.forEach((anchor, i) => {
      const nextIndex = i + 1 < flightAnchors.length ? flightAnchors[i + 1].index : null
      const scope = sliceScope(text, anchor.index, nextIndex)

      const seg = emptySegment('FLIGHT', 95)
      seg.identifier = field(anchor.identifier, anchor.confidence, 'regex')
      seg.provider = anchor.provider
        ? field(anchor.provider, anchor.confidence, 'dictionary')
        : field<string>(null, 0, 'unset')
      seg.confirmationNumber = confirmationNumber

      const airports = findAirportCodesInScope(scope)
      if (airports[0]) {
        seg.departureLocationCode = field(airports[0].code, airports[0].confidence, 'dictionary')
        const info = lookupAirport(airports[0].code)
        if (info) seg.departureLocation = field(`${info.city} (${info.name})`, airports[0].confidence, 'dictionary')
      }
      if (airports[1]) {
        seg.arrivalLocationCode = field(airports[1].code, airports[1].confidence, 'dictionary')
        const info = lookupAirport(airports[1].code)
        if (info) seg.arrivalLocation = field(`${info.city} (${info.name})`, airports[1].confidence, 'dictionary')
      }

      // Dates found *before* the flight mention are usually document metadata
      // (booking date, issue date) rather than travel dates — those almost
      // always appear at or after "Flight AA123" itself, so search forward only.
      const dateScope = text.slice(anchor.index, nextIndex ?? Math.min(text.length, anchor.index + SCOPE_RADIUS * 2))
      const { departure, arrival } = findDateTimes(dateScope, referenceDate)
      seg.departureTime = departure
      seg.arrivalTime = arrival

      seg.ticketNumber = findTicketNumber(scope)
      seg.seat = findSeat(scope)
      seg.cabin = findCabin(scope)
      seg.travelClass = seg.cabin
      seg.departureGate = findGate(scope)
      seg.departureTerminal = findTerminal(scope)

      const { price, currency } = findPrice(scope)
      seg.price = price
      seg.currency = currency

      segments.push(seg)
    })
  } else {
    // No flight numbers found — treat the whole document as a single, less-structured segment.
    const { type, confidence } = guessTransportType(text)
    const seg = emptySegment(type, confidence)
    seg.confirmationNumber = confirmationNumber

    const airports = findAirportCodesInScope(text)
    if (airports[0]) {
      seg.departureLocationCode = field(airports[0].code, airports[0].confidence, 'dictionary')
      const info = lookupAirport(airports[0].code)
      if (info) seg.departureLocation = field(`${info.city} (${info.name})`, airports[0].confidence, 'dictionary')
    }
    if (airports[1]) {
      seg.arrivalLocationCode = field(airports[1].code, airports[1].confidence, 'dictionary')
      const info = lookupAirport(airports[1].code)
      if (info) seg.arrivalLocation = field(`${info.city} (${info.name})`, airports[1].confidence, 'dictionary')
    }

    const { departure, arrival } = findDateTimes(text, referenceDate)
    seg.departureTime = departure
    seg.arrivalTime = arrival

    const { price, currency } = findPrice(text)
    seg.price = price
    seg.currency = currency

    segments.push(seg)
  }

  const allFields = [
    ...passengerNames,
    confirmationNumber,
    ...segments.flatMap((s) => Object.values(s) as ExtractedField<unknown>[]),
  ]
  const known = allFields.filter((f) => f.value !== null)
  const overallConfidence = known.length
    ? Math.round(known.reduce((sum, f) => sum + f.confidence, 0) / known.length)
    : 0

  return { passengerNames, segments, rawText: text, overallConfidence }
}

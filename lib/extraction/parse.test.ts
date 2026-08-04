import { describe, it, expect } from 'vitest'
import { parseItinerary } from './parse'

const REF_DATE = new Date('2026-01-01T00:00:00Z')

describe('parseItinerary', () => {
  it('extracts a single well-formed flight segment with high confidence', () => {
    const text = `
      American Airlines - E-Ticket Itinerary
      Passenger: SMITH/JOHN MR
      Booking Reference: XJ7K2P
      Flight AA123
      Departure: Kingston (KIN) Terminal 1
      Arrival: Miami (MIA)
      Departure Time: Dec 15, 2026 2:30 PM
      Arrival Time: Dec 15, 2026 5:45 PM
      Seat: 14A
      Cabin: Economy
      Gate: B12
      Ticket Number: 0012345678901
      Fare: USD 349.00
    `
    const result = parseItinerary(text, REF_DATE)

    expect(result.segments).toHaveLength(1)
    const seg = result.segments[0]
    expect(seg.identifier.value).toBe('AA123')
    expect(seg.provider.value).toBe('American Airlines')
    expect(seg.provider.confidence).toBeGreaterThanOrEqual(90)
    expect(seg.confirmationNumber.value).toBe('XJ7K2P')
    expect(seg.departureLocationCode.value).toBe('KIN')
    expect(seg.arrivalLocationCode.value).toBe('MIA')
    expect(seg.seat.value).toBe('14A')
    expect(seg.departureGate.value).toBe('B12')
    expect(seg.price.value).toBe(349)
    expect(seg.currency.value).toBe('USD')
    expect(result.passengerNames.map((f) => f.value)).toContain('John Smith')
  })

  it('does not mistake a gate number for a second flight segment', () => {
    // "B12" (gate) looks like an IATA prefix+digits pattern but B is not a
    // known one-letter... this specifically regression-tests a real bug
    // found during manual testing where "Gate: B12" created a phantom segment.
    const text = `
      Flight AA123
      Departure: Kingston (KIN)
      Arrival: Miami (MIA)
      Gate: B12
      Departure Time: Dec 15, 2026 2:30 PM
    `
    const result = parseItinerary(text, REF_DATE)
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].identifier.value).toBe('AA123')
    expect(result.segments[0].departureGate.value).toBe('B12')
  })

  it('still recognizes real letter+digit airline codes like B6 (JetBlue)', () => {
    const text = 'Flight B6 205\nDeparture: New York (JFK)\nArrival: Miami (MIA)'
    const result = parseItinerary(text, REF_DATE)
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].identifier.value).toBe('B6205')
    expect(result.segments[0].provider.value).toBe('JetBlue Airways')
  })

  it('creates one segment per distinct flight number for multi-leg itineraries', () => {
    const text = `
      Flight AA123
      Departure: Kingston (KIN)
      Arrival: Miami (MIA)
      Departure Time: Dec 15, 2026 2:30 PM

      Flight AA456
      Departure: Miami (MIA)
      Arrival: New York (JFK)
      Departure Time: Dec 15, 2026 8:00 PM
    `
    const result = parseItinerary(text, REF_DATE)
    expect(result.segments).toHaveLength(2)
    expect(result.segments[0].identifier.value).toBe('AA123')
    expect(result.segments[1].identifier.value).toBe('AA456')
  })

  it('falls back to a single OTHER segment when no flight number is present', () => {
    const text = 'Hotel reservation at Blue Lagoon Resort, check-in Dec 20 2026'
    const result = parseItinerary(text, REF_DATE)
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].transportType.value).toBe('HOTEL')
  })

  it('guesses transport type from keywords for non-flight bookings', () => {
    expect(parseItinerary('Train ticket, Amtrak service', REF_DATE).segments[0].transportType.value).toBe('TRAIN')
    expect(parseItinerary('Greyhound bus reservation', REF_DATE).segments[0].transportType.value).toBe('BUS')
    expect(parseItinerary('Ferry crossing to the island', REF_DATE).segments[0].transportType.value).toBe('FERRY')
  })

  it('returns empty/zero-confidence fields rather than guessing when data is absent', () => {
    const result = parseItinerary('Just some random text with no travel info.', REF_DATE)
    const seg = result.segments[0]
    expect(seg.identifier.value).toBeNull()
    expect(seg.confirmationNumber.value).toBeNull()
    expect(seg.price.value).toBeNull()
  })

  it('computes an overall confidence between 0 and 100', () => {
    const result = parseItinerary('Flight AA123 from KIN to MIA on Dec 15, 2026 2:30 PM', REF_DATE)
    expect(result.overallConfidence).toBeGreaterThan(0)
    expect(result.overallConfidence).toBeLessThanOrEqual(100)
  })
})

import { describe, it, expect } from 'vitest'
import { resolveSegment } from './resolveSegment'
import type { VoiceSegment } from './types'

function makeSegment(overrides: Partial<VoiceSegment>): VoiceSegment {
  return {
    id: 'seg-1',
    order: 0,
    transportType: 'FLIGHT',
    status: 'SCHEDULED',
    provider: null,
    identifier: null,
    departureLocation: null,
    departureLocationCode: null,
    departureTime: null,
    arrivalLocation: null,
    arrivalLocationCode: null,
    arrivalTime: null,
    confirmationNumber: null,
    notes: null,
    monitoringStatus: null,
    monitoringCheckedAt: null,
    ...overrides,
  }
}

const NOW = new Date('2026-06-15T12:00:00Z')

describe('resolveSegment', () => {
  it('returns not_found for an empty trip', () => {
    expect(resolveSegment([], 'next', NOW)).toEqual({ type: 'not_found' })
  })

  it('resolves "next" to the soonest not-yet-arrived segment with a future departure', () => {
    const past = makeSegment({ id: 'past', order: 0, status: 'DEPARTED', departureTime: new Date('2026-06-14T00:00:00Z') })
    const soonest = makeSegment({ id: 'soonest', order: 1, status: 'SCHEDULED', departureTime: new Date('2026-06-16T00:00:00Z') })
    const later = makeSegment({ id: 'later', order: 2, status: 'SCHEDULED', departureTime: new Date('2026-06-20T00:00:00Z') })
    const result = resolveSegment([past, later, soonest], 'next', NOW)
    expect(result).toEqual({ type: 'found', segment: soonest })
  })

  it('"next" is not_found when nothing is upcoming', () => {
    const arrived = makeSegment({ id: 'a', status: 'COMPLETED', departureTime: new Date('2026-06-01T00:00:00Z') })
    expect(resolveSegment([arrived], 'next', NOW)).toEqual({ type: 'not_found' })
  })

  it('resolves "first" and "last" by order, independent of departure time', () => {
    const a = makeSegment({ id: 'a', order: 0 })
    const b = makeSegment({ id: 'b', order: 1 })
    const c = makeSegment({ id: 'c', order: 2 })
    expect(resolveSegment([c, a, b], 'first', NOW)).toEqual({ type: 'found', segment: a })
    expect(resolveSegment([c, a, b], 'last', NOW)).toEqual({ type: 'found', segment: c })
  })

  it('matches a single segment by flight identifier, case-insensitively', () => {
    const flight = makeSegment({ id: 'aa123', identifier: 'AA123' })
    const other = makeSegment({ id: 'bb456', identifier: 'BB456' })
    expect(resolveSegment([flight, other], 'aa123', NOW)).toEqual({ type: 'found', segment: flight })
  })

  it('matches a single segment by destination city', () => {
    const toMiami = makeSegment({ id: 'miami', arrivalLocation: 'Miami' })
    const toKingston = makeSegment({ id: 'kingston', arrivalLocation: 'Kingston' })
    const result = resolveSegment([toMiami, toKingston], 'the flight to miami', NOW)
    expect(result).toEqual({ type: 'found', segment: toMiami })
  })

  it('returns ambiguous with all real candidates when a query matches more than one segment', () => {
    const hotelA = makeSegment({ id: 'hotel-a', transportType: 'HOTEL', provider: 'Marriott' })
    const hotelB = makeSegment({ id: 'hotel-b', transportType: 'HOTEL', provider: 'Hilton' })
    const flight = makeSegment({ id: 'flight', transportType: 'FLIGHT' })
    const result = resolveSegment([hotelA, hotelB, flight], 'hotel', NOW)
    expect(result.type).toBe('ambiguous')
    if (result.type === 'ambiguous') {
      expect(result.candidates.map((s) => s.id).sort()).toEqual(['hotel-a', 'hotel-b'])
    }
  })

  it('returns not_found when nothing matches the query text', () => {
    const flight = makeSegment({ id: 'flight', identifier: 'AA123' })
    expect(resolveSegment([flight], 'submarine', NOW)).toEqual({ type: 'not_found' })
  })
})

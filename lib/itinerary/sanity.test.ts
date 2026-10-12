import { describe, it, expect } from 'vitest'
import { checkItinerary, type SanitySegment } from './sanity'

function seg(o: Partial<SanitySegment> & { id: string; order: number }): SanitySegment {
  return { transportType: 'FLIGHT', label: o.id, departureTime: null, arrivalTime: null, departureLocationCode: null, arrivalLocationCode: null, ...o }
}

const leg1 = seg({ id: 'AA1', order: 0, departureTime: '2026-12-01T14:00:00Z', arrivalTime: '2026-12-01T17:00:00Z', departureLocationCode: 'JFK', arrivalLocationCode: 'MIA' })

describe('checkItinerary', () => {
  it('finds nothing wrong with a sensible connection', () => {
    const leg2 = seg({ id: 'AA2', order: 1, departureTime: '2026-12-01T19:00:00Z', arrivalTime: '2026-12-01T20:30:00Z', departureLocationCode: 'MIA', arrivalLocationCode: 'MBJ' })
    expect(checkItinerary([leg1, leg2])).toEqual([])
  })

  it('flags a next flight that leaves before the previous one lands', () => {
    const leg2 = seg({ id: 'AA2', order: 1, departureTime: '2026-12-01T16:30:00Z', departureLocationCode: 'MIA' })
    expect(checkItinerary([leg1, leg2]).map((i) => i.code)).toEqual(['MISSED_CONNECTION'])
  })

  it('warns on a connection under the usual minimum', () => {
    const leg2 = seg({ id: 'AA2', order: 1, departureTime: '2026-12-01T17:30:00Z', departureLocationCode: 'MIA' })
    const [issue] = checkItinerary([leg1, leg2])
    expect(issue.code).toBe('TIGHT_CONNECTION')
    expect(issue.message).toContain('30 minutes')
  })

  it('warns when the next leg leaves from a different airport', () => {
    const leg2 = seg({ id: 'B6', order: 1, departureTime: '2026-12-01T21:00:00Z', departureLocationCode: 'FLL' })
    expect(checkItinerary([leg1, leg2]).map((i) => i.code)).toEqual(['DIFFERENT_STATION'])
  })

  it('flags segments placed out of time order', () => {
    const earlier = seg({ id: 'EARLY', order: 1, departureTime: '2026-11-30T10:00:00Z', arrivalTime: '2026-11-30T11:00:00Z' })
    expect(checkItinerary([leg1, earlier]).map((i) => i.code)).toContain('OUT_OF_ORDER')
  })

  it('flags a segment that ends before it starts', () => {
    const typo = seg({ id: 'TYPO', order: 0, departureTime: '2026-12-01T14:00:00Z', arrivalTime: '2026-12-01T02:00:00Z' })
    expect(checkItinerary([typo]).map((i) => i.code)).toEqual(['ENDS_BEFORE_START'])
  })

  it('does not treat a dinner during a hotel stay as a conflict', () => {
    const hotel = seg({ id: 'Hotel', order: 1, transportType: 'HOTEL', departureTime: '2026-12-01T20:00:00Z', arrivalTime: '2026-12-05T16:00:00Z' })
    const dinner = seg({ id: 'Dinner', order: 2, transportType: 'RESTAURANT', departureTime: '2026-12-02T23:00:00Z' })
    const home = seg({ id: 'AA9', order: 3, departureTime: '2026-12-05T19:00:00Z', departureLocationCode: 'MIA' })
    expect(checkItinerary([leg1, hotel, dinner, home])).toEqual([])
  })
})

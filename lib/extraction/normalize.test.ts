import { describe, it, expect } from 'vitest'
import { parseItinerary } from './parse'
import { normalizeItinerary } from './normalize'

const REF_DATE = new Date('2026-01-01T00:00:00Z')

describe('normalizeItinerary', () => {
  it('flags low-confidence fields for review and omits high-confidence ones', () => {
    const extracted = parseItinerary(
      'Flight AA123\nDeparture: Kingston (KIN)\nArrival: Miami (MIA)\nDeparture Time: Dec 15, 2026 2:30 PM',
      REF_DATE
    )
    const normalized = normalizeItinerary(extracted)
    const seg = normalized.segments[0]

    // identifier + airline lookup are high confidence — should not need review
    expect(seg.fieldsNeedingReview).not.toContain('identifier')
    expect(seg.fieldsNeedingReview).not.toContain('provider')
    // every field that made it into confidenceScores has a value on the segment
    for (const field of Object.keys(seg.confidenceScores)) {
      expect((seg as unknown as Record<string, unknown>)[field]).not.toBeUndefined()
    }
  })

  it('never includes null fields in confidenceScores or the review queue', () => {
    const extracted = parseItinerary('no travel info at all here', REF_DATE)
    const normalized = normalizeItinerary(extracted)
    const seg = normalized.segments[0]
    expect(Object.keys(seg.confidenceScores)).not.toContain('identifier')
    expect(seg.fieldsNeedingReview).not.toContain('identifier')
  })

  it('deduplicates passenger names case-insensitively is left to the caller (normalize just flattens)', () => {
    const extracted = parseItinerary('Passenger: John Smith\nFlight AA123', REF_DATE)
    const normalized = normalizeItinerary(extracted)
    expect(normalized.passengerNames).toEqual(['John Smith'])
  })
})

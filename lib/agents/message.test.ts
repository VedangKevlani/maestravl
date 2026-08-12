import { describe, it, expect } from 'vitest'
import { describeDisruptionReason, composeRescheduleRequest, composeAwarenessInquiry } from './message'

describe('describeDisruptionReason', () => {
  it('describes a cancellation', () => {
    expect(describeDisruptionReason('AA123 (KIN -> MIA)', 'CANCELLED', null)).toBe(
      "Our passenger's AA123 (KIN -> MIA) was cancelled."
    )
  })

  it('formats a delay in hours and minutes', () => {
    expect(describeDisruptionReason('AA123', 'DELAYED', 240)).toContain('4 hours')
    expect(describeDisruptionReason('AA123', 'DELAYED', 30)).toContain('30 minutes')
    expect(describeDisruptionReason('AA123', 'DELAYED', 90)).toContain('1 hour 30 minutes')
  })

  it('falls back to a generic status-change line with no delay data', () => {
    expect(describeDisruptionReason('AA123', 'DELAYED', null)).toBe("Our passenger's AA123 status has changed.")
  })
})

describe('composeRescheduleRequest', () => {
  it('never claims the change is confirmed, and includes the booking + requested time', () => {
    const { subject, body } = composeRescheduleRequest({
      segmentLabel: 'Island Transfers pickup',
      confirmationNumber: 'ABC123',
      originalTime: new Date('2026-12-15T14:00:00Z'),
      proposedTime: new Date('2026-12-15T18:00:00Z'),
      timezone: 'America/Jamaica',
      reasonText: "Our passenger's flight has been delayed by approximately 4 hours.",
    })

    expect(subject).toBe('Request to reschedule — Island Transfers pickup (Booking ABC123)')
    expect(body).toContain('ABC123')
    expect(body).toContain('Could you please confirm whether this change is possible?')
    expect(body.toLowerCase()).not.toContain('confirmed')
    expect(body.toLowerCase()).not.toContain('has been changed')
  })

  it('omits the original-time block when it is unknown, and omits the Booking line entirely rather than showing N/A', () => {
    const { body } = composeRescheduleRequest({
      segmentLabel: 'Airport transfer',
      confirmationNumber: null,
      originalTime: null,
      proposedTime: new Date('2026-12-15T18:00:00Z'),
      timezone: null,
      reasonText: 'Our passenger was delayed.',
    })
    expect(body).not.toContain('Original time:')
    expect(body).not.toContain('Booking:')
    expect(body).not.toContain('N/A')
  })

  it('renders times in the segment\'s own timezone, not whatever zone the server happens to run in', () => {
    // 2026-12-15T18:00:00Z is 1pm in New York (UTC-5 in December) and 10am
    // in Los Angeles (UTC-8) — if this ever renders as neither, something
    // is falling back to the test runner's local zone instead of the one
    // passed in.
    const ny = composeRescheduleRequest({
      segmentLabel: 'Hotel check-in',
      confirmationNumber: null,
      originalTime: null,
      proposedTime: new Date('2026-12-15T18:00:00Z'),
      timezone: 'America/New_York',
      reasonText: 'x',
    })
    expect(ny.body).toContain('1:00')
    expect(ny.body).toContain('New York time')

    const la = composeRescheduleRequest({
      segmentLabel: 'Hotel check-in',
      confirmationNumber: null,
      originalTime: null,
      proposedTime: new Date('2026-12-15T18:00:00Z'),
      timezone: 'America/Los_Angeles',
      reasonText: 'x',
    })
    expect(la.body).toContain('10:00')
  })

  it('falls back to plain "local time", not a technical zone abbreviation, when the segment has no timezone on file', () => {
    const { body } = composeRescheduleRequest({
      segmentLabel: 'Hotel check-in',
      confirmationNumber: null,
      originalTime: null,
      proposedTime: new Date('2026-12-15T18:00:00Z'),
      timezone: null,
      reasonText: 'x',
    })
    expect(body).toContain('local time')
    expect(body).not.toMatch(/\bUTC\b|\bGMT\b/)
  })

  it('mentions a backup time when given one, and asks about "either" rather than a single change', () => {
    const { body } = composeRescheduleRequest({
      segmentLabel: 'Airport transfer',
      confirmationNumber: null,
      originalTime: null,
      proposedTime: new Date('2026-12-15T18:00:00Z'),
      alternativeTime: new Date('2026-12-15T18:45:00Z'),
      timezone: 'UTC',
      reasonText: 'x',
    })
    expect(body).toContain('Preferred new time:')
    expect(body).toContain("Alternative, if that doesn't work:")
    expect(body).toContain('Could you please confirm whether either of these times would work?')
    expect(body.toLowerCase()).not.toContain('confirmed.')
  })

  it('omits any mention of an alternative when none is given', () => {
    const { body } = composeRescheduleRequest({
      segmentLabel: 'Airport transfer',
      confirmationNumber: null,
      originalTime: null,
      proposedTime: new Date('2026-12-15T18:00:00Z'),
      timezone: 'UTC',
      reasonText: 'x',
    })
    expect(body).not.toContain('Alternative')
    expect(body).toContain('Requested new time:')
  })
})

describe('composeAwarenessInquiry', () => {
  it('asks rather than requests a specific time, and never claims confirmation', () => {
    const { subject, body } = composeAwarenessInquiry({
      segmentLabel: 'Ocean Grill dinner reservation',
      confirmationNumber: 'XJ7K2P',
      reasonText: "Our passenger's flight has been delayed by approximately 2 hours.",
    })
    expect(subject).toContain('Ocean Grill dinner reservation')
    expect(body).toContain('XJ7K2P')
    expect(body.toLowerCase()).not.toContain('confirmed')
  })
})

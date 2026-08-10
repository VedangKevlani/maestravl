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
      reasonText: "Our passenger's flight has been delayed by approximately 4 hours.",
    })

    expect(subject).toBe('Request to reschedule — Island Transfers pickup (Booking ABC123)')
    expect(body).toContain('ABC123')
    expect(body).toContain('Could you please confirm whether this change is possible?')
    expect(body.toLowerCase()).not.toContain('confirmed')
    expect(body.toLowerCase()).not.toContain('has been changed')
  })

  it('omits the original-time block when it is unknown', () => {
    const { body } = composeRescheduleRequest({
      segmentLabel: 'Airport transfer',
      confirmationNumber: null,
      originalTime: null,
      proposedTime: new Date('2026-12-15T18:00:00Z'),
      reasonText: 'Our passenger was delayed.',
    })
    expect(body).not.toContain('Original time:')
    expect(body).toContain('N/A')
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

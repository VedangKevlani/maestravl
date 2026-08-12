import { describe, it, expect } from 'vitest'
import { computeManualDelayMinutes } from './computeManualDelay'

describe('computeManualDelayMinutes', () => {
  it('computes the delay in minutes from the scheduled to the new time', () => {
    const result = computeManualDelayMinutes(new Date('2026-08-12T20:00:00Z'), '2026-08-12T22:30:00.000Z', 'departure time')
    expect(result).toEqual({ delayMinutes: 150 })
  })

  it('errors honestly when there is no scheduled time on file, rather than guessing', () => {
    const result = computeManualDelayMinutes(null, '2026-08-12T22:30:00.000Z', 'check-in')
    expect('error' in result).toBe(true)
    if ('error' in result) expect(result.error).toContain('check-in')
  })

  it('rejects a new time that is not after the scheduled time', () => {
    const result = computeManualDelayMinutes(new Date('2026-08-12T20:00:00Z'), '2026-08-12T18:00:00.000Z', 'departure time')
    expect('error' in result).toBe(true)
  })

  it('rejects a new time equal to the scheduled time (zero minutes is not a delay)', () => {
    const result = computeManualDelayMinutes(new Date('2026-08-12T20:00:00Z'), '2026-08-12T20:00:00.000Z', 'departure time')
    expect('error' in result).toBe(true)
  })

  it('caps at 48 hours, rejecting anything longer as not really "a delay"', () => {
    const result = computeManualDelayMinutes(new Date('2026-08-12T20:00:00Z'), '2026-08-15T20:01:00.000Z', 'departure time')
    expect('error' in result).toBe(true)
    if ('error' in result) expect(result.error.toLowerCase()).toContain('cancelled')
  })

  it('accepts exactly 48 hours as the boundary', () => {
    const result = computeManualDelayMinutes(new Date('2026-08-12T20:00:00Z'), '2026-08-14T20:00:00.000Z', 'departure time')
    expect(result).toEqual({ delayMinutes: 2880 })
  })
})

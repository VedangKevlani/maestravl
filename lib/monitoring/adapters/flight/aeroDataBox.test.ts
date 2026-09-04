import { describe, it, expect } from 'vitest'
import { mapStatus } from './aeroDataBox'

describe('mapStatus', () => {
  it('maps "Delayed" to DELAYED', () => {
    // Regression test: found live 2026-09 against a real currently-delayed
    // flight (Porter PD1672) — this exact case had no branch at all and
    // silently fell through to UNKNOWN, so a real, correctly-computed
    // delayMinutes never actually triggered disruption detection
    // (classifyDisruption only acts on DELAYED/CANCELLED, never UNKNOWN).
    expect(mapStatus('Delayed')).toBe('DELAYED')
    expect(mapStatus('delayed')).toBe('DELAYED')
  })

  it('maps the other known real-world status strings correctly', () => {
    expect(mapStatus('Expected')).toBe('ON_TIME')
    expect(mapStatus('EnRoute')).toBe('DEPARTED')
    expect(mapStatus('Departed')).toBe('DEPARTED')
    expect(mapStatus('Landed')).toBe('ARRIVED')
    expect(mapStatus('Arrived')).toBe('ARRIVED')
    expect(mapStatus('Cancelled')).toBe('CANCELLED')
    expect(mapStatus('CancelledUncertain')).toBe('CANCELLED')
    expect(mapStatus('Diverted')).toBe('DELAYED')
  })

  it('falls back to UNKNOWN for anything unrecognized, never throws', () => {
    expect(mapStatus('SomethingNew')).toBe('UNKNOWN')
    expect(mapStatus(undefined)).toBe('UNKNOWN')
    expect(mapStatus('')).toBe('UNKNOWN')
  })
})

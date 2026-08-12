import { describe, it, expect } from 'vitest'
import { locationText, buildUberDeepLink } from './uber'

describe('locationText', () => {
  it('prefers free-text location, annotated with the code when both are present', () => {
    expect(locationText({ departureLocation: 'Kingston Airport', departureLocationCode: 'KIN', arrivalLocation: null, arrivalLocationCode: null }, 'departure'))
      .toBe('Kingston Airport (KIN)')
  })

  it('falls back to the curated airport dictionary when only a code is present', () => {
    expect(locationText({ departureLocation: null, departureLocationCode: 'KIN', arrivalLocation: null, arrivalLocationCode: null }, 'departure'))
      .toBe('Norman Manley International (KIN)')
  })

  it('falls back to the bare code when the airport is not in the curated dictionary', () => {
    expect(locationText({ departureLocation: null, departureLocationCode: 'ZZZ', arrivalLocation: null, arrivalLocationCode: null }, 'departure'))
      .toBe('ZZZ')
  })

  it('returns null rather than fabricating a location when nothing is available', () => {
    expect(locationText({ departureLocation: null, departureLocationCode: null, arrivalLocation: null, arrivalLocationCode: null }, 'departure')).toBeNull()
  })

  it('reads the arrival side when asked for it', () => {
    expect(locationText({ departureLocation: null, departureLocationCode: null, arrivalLocation: 'Downtown Hotel', arrivalLocationCode: null }, 'arrival'))
      .toBe('Downtown Hotel')
  })
})

describe('buildUberDeepLink', () => {
  it('builds a valid m.uber.com/looking URL with the client id and JSON-encoded pickup/dropoff', () => {
    const href = buildUberDeepLink({ clientId: 'abc123', pickup: 'Kingston Airport (KIN)', dropoff: 'Downtown Hotel' })
    const url = new URL(href)

    expect(url.origin + url.pathname).toBe('https://m.uber.com/looking')
    expect(url.searchParams.get('client_id')).toBe('abc123')
    expect(JSON.parse(url.searchParams.get('pickup')!)).toEqual({ addressLine2: 'Kingston Airport (KIN)' })
    expect(JSON.parse(url.searchParams.get('drop[0]')!)).toEqual({ addressLine2: 'Downtown Hotel' })
  })
})

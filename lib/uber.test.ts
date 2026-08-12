import { describe, it, expect } from 'vitest'
import { locationText, buildUberDeepLink, isPlausibleUberTrip } from './uber'

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

describe('isPlausibleUberTrip', () => {
  it('is true for the same airport (a within-airport hop)', () => {
    expect(isPlausibleUberTrip('JFK', 'JFK')).toBe(true)
  })

  it('is true for two airports in the same metro area', () => {
    expect(isPlausibleUberTrip('JFK', 'EWR')).toBe(true) // ~25km apart
  })

  it('is false across a country border, even at moderate distance', () => {
    expect(isPlausibleUberTrip('KIN', 'MIA')).toBe(false) // different countries, ~700mi apart
  })

  it('is false for two airports far apart in the same country', () => {
    expect(isPlausibleUberTrip('MIA', 'ATL')).toBe(false) // both USA, ~970km apart
  })

  it('is false when either code is missing', () => {
    expect(isPlausibleUberTrip(null, 'JFK')).toBe(false)
    expect(isPlausibleUberTrip('JFK', null)).toBe(false)
  })

  it('is false when either code is unrecognized rather than guessing', () => {
    expect(isPlausibleUberTrip('JFK', 'ZZZ')).toBe(false)
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

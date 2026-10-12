import { describe, it, expect } from 'vitest'
import { resolveTrip, zoneForPlaceName, localTimeReport, describeSymbol, summarizeForecastDay, convertCurrency, roundMoney, cToF, type MetTimeseriesEntry } from './aroundPure'
import type { VoiceAccountContext, VoiceTripSummary } from './types'

const trip = (id: string, title: string, status = 'UPCOMING', startsAt: string | null = null): VoiceTripSummary => ({
  id, title, status, startsAt: startsAt ? new Date(startsAt) : null, endsAt: null, segmentCount: 2, nextSegmentLabel: null, nextSegmentStartsAt: null,
})
const account = (trips: VoiceTripSummary[], pageTripId: string | null = null): VoiceAccountContext => ({
  now: new Date('2026-10-12T12:00:00Z'), userName: 'Ada', homeTimezone: 'America/New_York', trips, needsYou: [], pageTripId,
})

describe('resolveTrip', () => {
  const trips = [trip('a', 'Jamaica Winter Break', 'UPCOMING', '2026-12-01T00:00:00Z'), trip('b', 'London Work Trip', 'UPCOMING', '2026-11-01T00:00:00Z'), trip('c', 'Paris 2025', 'COMPLETED')]

  it('matches a spoken name loosely', () => {
    expect(resolveTrip(account(trips), 'my jamaica trip')).toMatchObject({ type: 'found', trip: { id: 'a' } })
  })
  it('"next" is the soonest active/upcoming trip', () => {
    expect(resolveTrip(account(trips), 'next')).toMatchObject({ type: 'found', trip: { id: 'b' } })
  })
  it('defaults to the trip whose page is open', () => {
    expect(resolveTrip(account(trips, 'c'), undefined)).toMatchObject({ type: 'found', trip: { id: 'c' } })
  })
  it('asks instead of guessing when several trips are live', () => {
    expect(resolveTrip(account(trips), undefined).type).toBe('none_in_focus')
  })
  it('uses the only live trip when there is just one', () => {
    expect(resolveTrip(account([trips[0], trips[2]]), undefined)).toMatchObject({ type: 'found', trip: { id: 'a' } })
  })
  it('reports ambiguity with the real candidates', () => {
    const r = resolveTrip(account([trip('x', 'Jamaica June'), trip('y', 'Jamaica December')]), 'jamaica')
    expect(r.type).toBe('ambiguous')
  })
})

describe('local time', () => {
  it('finds zones by city or country-style names only when unambiguous', () => {
    expect(zoneForPlaceName('New York')).toBe('America/New_York')
    expect(zoneForPlaceName('Jamaica')).toBe('America/Jamaica')
    expect(zoneForPlaceName('Atlantis')).toBeNull()
  })
  it('reports the time difference from home', () => {
    const r = localTimeReport('Europe/London', 'America/New_York', new Date('2026-10-12T12:00:00Z'))
    expect(r.hoursAheadOfHome).toBe(5)
    expect(r.localTime).toMatch(/Monday.*1:00 PM/)
  })
  it('handles half-hour zones', () => {
    expect(localTimeReport('Asia/Kolkata', 'Europe/London', new Date('2026-12-12T12:00:00Z')).hoursAheadOfHome).toBe(5.5)
  })
})

describe('weather', () => {
  const hour = (iso: string, t: number, code: string, rain = 0, wind = 5): MetTimeseriesEntry => ({
    time: iso, data: { instant: { details: { air_temperature: t, wind_speed: wind } }, next_1_hours: { summary: { symbol_code: code }, details: { precipitation_amount: rain } } },
  })
  // Local day 2026-10-13 in Jamaica (UTC-5) runs 05:00Z..05:00Z next day.
  const series = [
    hour('2026-10-13T04:00:00Z', 20, 'clearsky_night'),
    hour('2026-10-13T06:00:00Z', 24, 'partlycloudy_day'),
    hour('2026-10-13T12:00:00Z', 31, 'partlycloudy_day', 0.4, 10),
    hour('2026-10-13T18:00:00Z', 29, 'rainshowers_day', 2.1),
    hour('2026-10-14T03:00:00Z', 25, 'partlycloudy_night'),
  ]

  it('summarises one local day', () => {
    expect(summarizeForecastDay(series, '2026-10-13', -5)).toEqual({ date: '2026-10-13', lowC: 24, highC: 31, conditions: 'partly cloudy', totalRainMm: 2.5, maxWindKmh: 36 })
  })
  it('returns null beyond the forecast range', () => {
    expect(summarizeForecastDay(series, '2026-10-20', -5)).toBeNull()
  })
  it('describes MET symbol codes in plain words', () => {
    expect(describeSymbol('lightrainshowers_day')).toBe('light showers')
    expect(describeSymbol(undefined)).toBeNull()
    expect(cToF(30)).toBe(86)
  })
})

describe('currency', () => {
  const rates = { USD: 1, JMD: 158.67, EUR: 0.8926 }
  it('converts through the base currency', () => {
    expect(roundMoney(convertCurrency(50, 'USD', 'JMD', rates)!)).toBe(7933) // whole units above 1,000
    expect(roundMoney(convertCurrency(100, 'eur', 'usd', rates)!)).toBe(112.03)
  })
  it('returns null for an unknown currency', () => {
    expect(convertCurrency(10, 'USD', 'XYZ', rates)).toBeNull()
  })
})

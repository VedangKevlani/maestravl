import { describe, it, expect } from 'vitest'
import { pickBestOperatorMatch, pickBestRouteMatch, classifyAlerts, type TransitlandOperator, type TransitlandRoute } from './matching'

describe('pickBestOperatorMatch', () => {
  const operators: TransitlandOperator[] = [
    { onestop_id: 'o-amtrak', name: 'Amtrak' },
    { onestop_id: 'o-greyhound', name: 'Greyhound Lines' },
    { onestop_id: 'o-blank', name: null },
  ]

  it('prefers an exact normalized match', () => {
    expect(pickBestOperatorMatch(operators, 'Amtrak')?.onestop_id).toBe('o-amtrak')
    expect(pickBestOperatorMatch(operators, 'AMTRAK')?.onestop_id).toBe('o-amtrak')
  })

  it('falls back to a substring match either direction', () => {
    expect(pickBestOperatorMatch(operators, 'Greyhound')?.onestop_id).toBe('o-greyhound')
  })

  it('returns null when nothing plausibly matches', () => {
    expect(pickBestOperatorMatch(operators, 'Southwest Airlines')).toBeNull()
  })

  it('never matches on an empty/too-short provider name', () => {
    expect(pickBestOperatorMatch(operators, '')).toBeNull()
    expect(pickBestOperatorMatch(operators, 'A')).toBeNull()
  })
})

describe('pickBestRouteMatch', () => {
  const routes: TransitlandRoute[] = [
    { onestop_id: 'r-1', route_id: '1', route_short_name: '42', route_long_name: 'Downtown Express' },
    { onestop_id: 'r-2', route_id: '2', route_short_name: null, route_long_name: 'Northeast Regional 171' },
  ]

  it('matches an exact short_name', () => {
    expect(pickBestRouteMatch(routes, '42')?.onestop_id).toBe('r-1')
  })

  it('matches an exact long_name when short_name is unset', () => {
    expect(pickBestRouteMatch(routes, 'Northeast Regional 171')?.onestop_id).toBe('r-2')
  })

  it('falls back to a substring match', () => {
    expect(pickBestRouteMatch(routes, 'Express')?.onestop_id).toBe('r-1')
  })

  it('returns null when nothing matches', () => {
    expect(pickBestRouteMatch(routes, '999')).toBeNull()
  })
})

describe('classifyAlerts', () => {
  it('reports ON_TIME when there are no alerts', () => {
    expect(classifyAlerts([])).toEqual({ status: 'ON_TIME' })
    expect(classifyAlerts(null)).toEqual({ status: 'ON_TIME' })
  })

  it('maps a NO_SERVICE effect to CANCELLED', () => {
    const result = classifyAlerts([{ effect: 'NO_SERVICE', header_text: 'Route 42 cancelled today' }])
    expect(result.status).toBe('CANCELLED')
  })

  it('maps a SIGNIFICANT_DELAYS effect to DELAYED', () => {
    const result = classifyAlerts([{ effect: 'SIGNIFICANT_DELAYS', header_text: 'Delays on Route 42' }])
    expect(result.status).toBe('DELAYED')
  })

  it('falls back to keyword matching when effect is missing or unrecognized', () => {
    expect(classifyAlerts([{ header_text: 'Service suspended due to weather' }]).status).toBe('CANCELLED')
    expect(classifyAlerts([{ effect: 'OTHER_EFFECT', header_text: 'Expect delays this evening' }]).status).toBe('DELAYED')
  })

  it('extracts an explicit delay-minutes figure from the alert text when present', () => {
    const result = classifyAlerts([{ effect: 'SIGNIFICANT_DELAYS', header_text: 'Trains delayed approximately 45 minutes' }])
    expect(result.delayMinutes).toBe(45)
  })

  it('never fabricates a delay figure when none is stated', () => {
    const result = classifyAlerts([{ effect: 'SIGNIFICANT_DELAYS', header_text: 'Trains are experiencing delays' }])
    expect(result.delayMinutes).toBeUndefined()
  })

  it('ignores alerts that do not signal a service disruption', () => {
    const result = classifyAlerts([{ header_text: 'Reminder: please validate your ticket before boarding' }])
    expect(result.status).toBe('ON_TIME')
  })

  it('lets CANCELLED outrank DELAYED when multiple alerts disagree', () => {
    const result = classifyAlerts([
      { effect: 'SIGNIFICANT_DELAYS', header_text: 'Delays on part of the line' },
      { effect: 'NO_SERVICE', header_text: 'Service cancelled downtown' },
    ])
    expect(result.status).toBe('CANCELLED')
  })

  it('extracts text from a GTFS-RT-JSON-style {translation:[{text}]} shape', () => {
    const result = classifyAlerts([{ effect: 'NO_SERVICE', header_text: { translation: [{ text: 'No service today', language: 'en' }] } }])
    expect(result.message).toContain('No service today')
  })
})

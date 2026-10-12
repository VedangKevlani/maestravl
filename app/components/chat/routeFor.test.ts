import { describe, it, expect } from 'vitest'
import { routeFor } from './useVoiceTurn'

describe('routeFor — the assistant can only open Maestravl pages', () => {
  it('maps each target kind to its route', () => {
    expect(routeFor({ kind: 'dashboard', label: '' })).toBe('/dashboard')
    expect(routeFor({ kind: 'trip_map', tripId: 'cmabc123', label: '' })).toBe('/trips/cmabc123/map')
  })
  it('refuses an id that could escape the route', () => {
    expect(routeFor({ kind: 'trip', tripId: '../../evil', label: '' })).toBeNull()
    expect(routeFor({ kind: 'trip', tripId: 'https://evil.example', label: '' })).toBeNull()
  })
})

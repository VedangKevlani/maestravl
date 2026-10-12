import { describe, it, expect } from 'vitest'
import { haversineKm, interpolateGreatCircle, routeLine, scheduleProgress, proximityReport, formatDistance, type MapSegment } from './geo'

const JFK = { lat: 40.6413, lng: -73.7781 }
const MBJ = { lat: 18.5037, lng: -77.9134 }
const HOTEL = { lat: 18.53, lng: -77.84 }

describe('geometry', () => {
  it('measures JFK→MBJ about right (~2,480 km)', () => {
    expect(haversineKm(JFK, MBJ)).toBeGreaterThan(2400)
    expect(haversineKm(JFK, MBJ)).toBeLessThan(2560)
  })

  it('interpolates the endpoints exactly and the midpoint between them', () => {
    expect(interpolateGreatCircle(JFK, MBJ, 0).lat).toBeCloseTo(JFK.lat, 5)
    expect(interpolateGreatCircle(JFK, MBJ, 1).lng).toBeCloseTo(MBJ.lng, 5)
    const mid = interpolateGreatCircle(JFK, MBJ, 0.5)
    expect(haversineKm(JFK, mid)).toBeCloseTo(haversineKm(mid, MBJ), 0)
  })

  it('draws a route across the antimeridian as one short arc, not around the world', () => {
    const line = routeLine({ lat: 21.3, lng: -157.9 }, { lat: -33.9, lng: 151.2 }, true) // Honolulu → Sydney
    const lngs = line.map(([lng]) => lng)
    for (let i = 1; i < lngs.length; i++) expect(Math.abs(lngs[i] - lngs[i - 1])).toBeLessThan(10)
  })

  it('reports schedule progress only inside the window', () => {
    const dep = new Date('2026-12-01T14:00:00Z')
    const arr = new Date('2026-12-01T18:00:00Z')
    expect(scheduleProgress(dep, arr, new Date('2026-12-01T15:00:00Z'))).toBeCloseTo(0.25)
    expect(scheduleProgress(dep, arr, new Date('2026-12-01T13:00:00Z'))).toBeNull()
    expect(scheduleProgress(dep, null, new Date('2026-12-01T15:00:00Z'))).toBeNull()
  })

  it('formats distances for people', () => {
    expect(formatDistance(0.347)).toBe('350 m')
    expect(formatDistance(4.21)).toBe('4.2 km')
    expect(formatDistance(1240.4)).toBe('1,240 km')
  })
})

describe('proximityReport', () => {
  const flight: MapSegment = { id: 'f', label: 'AUD101', transportType: 'FLIGHT', status: 'SCHEDULED', departureTime: new Date('2026-12-01T14:00:00Z'), arrivalTime: new Date('2026-12-01T18:00:00Z'), from: JFK, to: MBJ }
  const hotel: MapSegment = { id: 'h', label: 'Hotel', transportType: 'HOTEL', status: 'SCHEDULED', departureTime: new Date('2026-12-01T20:00:00Z'), arrivalTime: new Date('2026-12-05T16:00:00Z'), from: HOTEL, to: null }

  it('says there is plenty of time when the passenger is near the airport well ahead', () => {
    const r = proximityReport([flight, hotel], { lat: 40.65, lng: -73.80 }, new Date('2026-12-01T09:00:00Z'))
    expect(r.next?.segmentId).toBe('f')
    expect(r.next?.verdict).toBe('plenty_of_time')
  })

  it('warns when the passenger is too far away to make it with the usual buffer', () => {
    // ~25 km away with 2h before departure: 2h buffer + travel time doesn't fit.
    const r = proximityReport([flight], { lat: 40.758, lng: -73.9855 }, new Date('2026-12-01T12:00:00Z'))
    expect(r.next?.verdict).toBe('cutting_it_close')
    expect(r.next?.leaveInMinutes).toBeLessThan(0)
  })

  it('gives no leave-by advice from another city entirely', () => {
    const r = proximityReport([flight], { lat: 51.5, lng: -0.12 }, new Date('2026-12-01T09:00:00Z'))
    expect(r.next?.verdict).toBe('too_far_to_advise')
  })

  it('estimates position along an in-progress flight and whether the passenger is aboard', () => {
    const now = new Date('2026-12-01T16:00:00Z')
    const mid = interpolateGreatCircle(JFK, MBJ, 0.5)
    const aboard = proximityReport([flight], mid, now)
    expect(aboard.current?.segmentId).toBe('f')
    expect(aboard.current?.probablyAboard).toBe(true)
    expect(proximityReport([flight], JFK, now).current?.probablyAboard).toBe(false)
    expect(proximityReport([flight], null, now).current?.probablyAboard).toBeNull()
  })

  it('recognises when the passenger is at one of their trip places', () => {
    const r = proximityReport([flight, hotel], { lat: 18.5302, lng: -77.8402 }, new Date('2026-12-02T09:00:00Z'))
    expect(r.atPlace).toMatchObject({ segmentId: 'h', role: 'from' })
  })

  it('ignores cancelled segments', () => {
    const r = proximityReport([{ ...flight, status: 'CANCELLED' }], JFK, new Date('2026-12-01T09:00:00Z'))
    expect(r.next).toBeNull()
  })
})

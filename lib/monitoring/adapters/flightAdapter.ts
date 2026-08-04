import { createStubAdapter } from './stubAdapter'

export const flightAdapter = createStubAdapter({
  id: 'flight-adapter-v1',
  supports: ['FLIGHT'],
  envVar: 'FLIGHT_MONITORING_API_KEY',
  buildTrackingKey: (segment) => {
    if (!segment.identifier || !segment.departureTime) return null
    return `${segment.identifier}:${segment.departureTime.toISOString().slice(0, 10)}`
  },
})

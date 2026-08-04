import { createStubAdapter } from './stubAdapter'

export const busAdapter = createStubAdapter({
  id: 'bus-adapter-v1',
  supports: ['BUS'],
  envVar: 'BUS_MONITORING_API_KEY',
  buildTrackingKey: (segment) => {
    if (!segment.identifier || !segment.departureTime) return null
    return `${segment.identifier}:${segment.departureTime.toISOString().slice(0, 10)}`
  },
})

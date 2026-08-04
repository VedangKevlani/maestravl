import { createStubAdapter } from './stubAdapter'

/** Covers ferry, cruise, and general boat/charter segments — they tend to share the same operator-schedule style provider APIs. */
export const boatAdapter = createStubAdapter({
  id: 'boat-adapter-v1',
  supports: ['FERRY', 'CRUISE', 'BOAT'],
  envVar: 'MARITIME_MONITORING_API_KEY',
  buildTrackingKey: (segment) => {
    if (!segment.identifier || !segment.departureTime) return null
    return `${segment.identifier}:${segment.departureTime.toISOString().slice(0, 10)}`
  },
})

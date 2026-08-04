import { createStubAdapter } from './stubAdapter'

export const trainAdapter = createStubAdapter({
  id: 'train-adapter-v1',
  supports: ['TRAIN'],
  envVar: 'TRAIN_MONITORING_API_KEY',
  buildTrackingKey: (segment) => {
    if (!segment.identifier || !segment.departureTime) return null
    return `${segment.identifier}:${segment.departureTime.toISOString().slice(0, 10)}`
  },
})

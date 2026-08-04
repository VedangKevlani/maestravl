import { createStubAdapter } from './stubAdapter'

export const taxiAdapter = createStubAdapter({
  id: 'taxi-adapter-v1',
  supports: ['TAXI', 'RENTAL_CAR'],
  envVar: 'TAXI_DISPATCH_API_KEY',
  buildTrackingKey: (segment) => {
    if (!segment.identifier) return null
    return segment.identifier
  },
})

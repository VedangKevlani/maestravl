import { createTransitlandAdapter } from './transitland/transitlandAdapter'

// GTFS route_type 2 = rail (see transitland/client.ts's searchRoutes for the
// caveat this is a best-effort filter, not exhaustive).
export const trainAdapter = createTransitlandAdapter({
  id: 'train-adapter-v1',
  supports: ['TRAIN'],
  gtfsRouteType: 2,
})

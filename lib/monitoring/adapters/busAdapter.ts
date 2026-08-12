import { createTransitlandAdapter } from './transitland/transitlandAdapter'

// GTFS route_type 3 = bus (see transitland/client.ts's searchRoutes for the
// caveat this is a best-effort filter, not exhaustive).
export const busAdapter = createTransitlandAdapter({
  id: 'bus-adapter-v1',
  supports: ['BUS'],
  gtfsRouteType: 3,
})

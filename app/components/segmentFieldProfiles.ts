// Which fields make sense on the add/edit segment forms, and how to label
// them, varies a lot by transport type — a flight has a departure AND
// arrival airport, a hotel has one location and a check-in/check-out pair,
// a restaurant has one location and a single reservation time (no
// meaningful "arrival"). Shared by TransportTypeForm.tsx (create) and
// SegmentEditForm.tsx (edit) so the two never drift apart.
export type SegmentFieldProfile =
  | {
      hasRoute: true
      departureLocationLabel: string
      arrivalLocationLabel: string
      departureCodeLabel: string
      arrivalCodeLabel: string
      departureTimeLabel: string
      arrivalTimeLabel: string
      hasTerminalGate: boolean
      hasSeatCabin: boolean
    }
  | {
      hasRoute: false
      // Single-location types store their one location in departureLocation
      // (arrivalLocation stays unused) — no airport/station-style code
      // applies here, so there's no code field at all.
      singleLocationLabel: string
      departureTimeLabel: string
      // null hides the field entirely — a restaurant reservation doesn't
      // have a meaningful separate "arrival" time.
      arrivalTimeLabel: string | null
    }

const GENERIC_ROUTE = {
  hasRoute: true as const,
  departureLocationLabel: 'Departure location',
  arrivalLocationLabel: 'Arrival location',
  departureCodeLabel: 'Departure code',
  arrivalCodeLabel: 'Arrival code',
  departureTimeLabel: 'Departure time',
  arrivalTimeLabel: 'Arrival time',
  hasTerminalGate: false,
  hasSeatCabin: false,
}

export const SEGMENT_FIELD_PROFILES: Record<string, SegmentFieldProfile> = {
  FLIGHT: {
    ...GENERIC_ROUTE,
    departureLocationLabel: 'Departure airport',
    arrivalLocationLabel: 'Arrival airport',
    departureCodeLabel: 'Departure airport code (e.g. KIN)',
    arrivalCodeLabel: 'Arrival airport code (e.g. MIA)',
    hasTerminalGate: true,
    hasSeatCabin: true,
  },
  TRAIN: { ...GENERIC_ROUTE, hasSeatCabin: true },
  BUS: { ...GENERIC_ROUTE, hasSeatCabin: true },
  TAXI: { ...GENERIC_ROUTE, departureTimeLabel: 'Pickup time', arrivalTimeLabel: 'Drop-off time' },
  FERRY: { ...GENERIC_ROUTE },
  CRUISE: { ...GENERIC_ROUTE, hasSeatCabin: true },
  BOAT: { ...GENERIC_ROUTE },
  HELICOPTER: { ...GENERIC_ROUTE },
  BICYCLE: { ...GENERIC_ROUTE, departureTimeLabel: 'Pickup time', arrivalTimeLabel: 'Drop-off time' },
  RENTAL_CAR: { ...GENERIC_ROUTE, departureTimeLabel: 'Pickup time', arrivalTimeLabel: 'Drop-off time' },
  WALKING: { ...GENERIC_ROUTE, departureTimeLabel: 'Start time', arrivalTimeLabel: 'End time' },
  HOTEL: {
    hasRoute: false,
    singleLocationLabel: 'Hotel location',
    departureTimeLabel: 'Check-in',
    arrivalTimeLabel: 'Check-out',
  },
  RESTAURANT: {
    hasRoute: false,
    singleLocationLabel: 'Restaurant location',
    departureTimeLabel: 'Reservation time',
    arrivalTimeLabel: null,
  },
  EXCURSION: {
    hasRoute: false,
    singleLocationLabel: 'Meeting point',
    departureTimeLabel: 'Start time',
    arrivalTimeLabel: 'End time',
  },
  OTHER: {
    hasRoute: false,
    singleLocationLabel: 'Location',
    departureTimeLabel: 'Date & time',
    arrivalTimeLabel: 'End time (optional)',
  },
}

export function getFieldProfile(transportType: string): SegmentFieldProfile {
  return SEGMENT_FIELD_PROFILES[transportType] ?? SEGMENT_FIELD_PROFILES.OTHER
}

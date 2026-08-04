// Single source of truth for the string-enum-like fields stored in SQLite
// (which has no native enum type — see prisma/schema.prisma).

export const TRANSPORT_TYPES = [
  'FLIGHT', 'TRAIN', 'BUS', 'TAXI', 'FERRY', 'CRUISE', 'BOAT',
  'HELICOPTER', 'BICYCLE', 'RENTAL_CAR', 'WALKING', 'HOTEL', 'RESTAURANT',
  'EXCURSION', 'OTHER',
] as const
export type TransportType = typeof TRANSPORT_TYPES[number]

export const SEGMENT_STATUSES = [
  'SCHEDULED', 'BOARDING', 'DEPARTED', 'DELAYED', 'CANCELLED', 'ARRIVED', 'COMPLETED',
] as const
export type SegmentStatus = typeof SEGMENT_STATUSES[number]

export const TRIP_STATUSES = ['UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const
export type TripStatus = typeof TRIP_STATUSES[number]

export const DOCUMENT_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const
export type DocumentStatus = typeof DOCUMENT_STATUSES[number]

export const MONITORING_STATUSES = ['NOT_CONFIGURED', 'ACTIVE', 'PAUSED', 'ERROR'] as const
export type MonitoringStatus = typeof MONITORING_STATUSES[number]

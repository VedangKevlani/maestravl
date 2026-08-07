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

// --- Agentic recovery (see prisma/schema.prisma's "Agentic recovery" section) ---

export const DISRUPTION_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH'] as const
export type DisruptionSeverity = typeof DISRUPTION_SEVERITIES[number]

export const AGENT_RUN_STATUSES = [
  'DETECTED', 'ANALYZING', 'CONTACTING', 'WAITING_FOR_RESPONSE', 'RESCHEDULING',
  'CONFIRMED', 'FAILED', 'ALTERNATIVE_FOUND', 'ACTION_REQUIRED', 'COMPLETED',
] as const
export type AgentRunStatus = typeof AGENT_RUN_STATUSES[number]

export const AGENT_ACTION_TYPES = [
  'ANALYZE_IMPACT', 'FIND_CONTACT', 'CONTACT_PROVIDER', 'REQUEST_RESCHEDULE',
  'VERIFY', 'UPDATE_ITINERARY', 'NOTIFY_PASSENGER', 'SEARCH_ALTERNATIVES', 'ESCALATE',
] as const
export type AgentActionType = typeof AGENT_ACTION_TYPES[number]

export const AGENT_ACTION_STATUSES = [
  'PENDING', 'REQUIRES_APPROVAL', 'APPROVED', 'EXECUTED', 'FAILED', 'SKIPPED',
] as const
export type AgentActionStatus = typeof AGENT_ACTION_STATUSES[number]

// Risk tiers from the product spec's authorization model — LOW executes
// automatically, MEDIUM/HIGH require a standing policy or explicit passenger
// approval before an AgentAction can move past REQUIRES_APPROVAL.
export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const
export type RiskLevel = typeof RISK_LEVELS[number]

export const CONTACT_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP', 'WEB_FORM', 'PORTAL', 'OTHER'] as const
export type ContactChannel = typeof CONTACT_CHANNELS[number]

export const CONTACT_SOURCES = ['ITINERARY', 'BOOKING_CONFIRMATION', 'MANUAL', 'WEB_LOOKUP'] as const
export type ContactSource = typeof CONTACT_SOURCES[number]

export const COMMUNICATION_DIRECTIONS = ['OUTBOUND', 'INBOUND'] as const
export type CommunicationDirection = typeof COMMUNICATION_DIRECTIONS[number]

export const COMMUNICATION_STATUSES = ['DRAFTED', 'SENT', 'FAILED', 'DELIVERED', 'RESPONDED'] as const
export type CommunicationStatus = typeof COMMUNICATION_STATUSES[number]

export const RESCHEDULE_STATUSES = ['REQUESTED', 'CONFIRMED', 'REJECTED', 'NO_RESPONSE', 'CANCELLED'] as const
export type RescheduleStatus = typeof RESCHEDULE_STATUSES[number]

// How much selecting an Alternative would disrupt segments downstream of it.
export const IMPACT_LEVELS = ['NONE', 'MINOR', 'MAJOR'] as const
export type ImpactLevel = typeof IMPACT_LEVELS[number]

// Impact classification used by the dependency engine (lib/dependency/graph.ts)
// for segments downstream of a disrupted one.
export const SEGMENT_IMPACT_LEVELS = ['DIRECT', 'POTENTIAL', 'UNAFFECTED'] as const
export type SegmentImpactLevel = typeof SEGMENT_IMPACT_LEVELS[number]

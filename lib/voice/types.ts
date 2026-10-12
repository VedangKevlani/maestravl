// Pure — shared shapes for the voice assistant. VoiceContext is a trip's
// full state, prefetched once per turn by lib/voice/tripContext.ts so the
// tool-calling loop in lib/voice/agent.ts never touches the DB itself.

export interface VoiceSegment {
  id: string
  order: number
  transportType: string
  status: string
  provider: string | null
  identifier: string | null
  departureLocation: string | null
  departureLocationCode: string | null
  departureTime: Date | null
  arrivalLocation: string | null
  arrivalLocationCode: string | null
  arrivalTime: Date | null
  confirmationNumber: string | null
  notes: string | null
  timezone: string | null
  monitoringStatus: string | null // formatMonitoringStatus() output, or null if never checked
  monitoringCheckedAt: Date | null
  /** A configured live adapter is watching it — only then can "check status now" do anything. */
  monitoringActive: boolean
}

export interface VoiceRecoveryAction {
  segmentId: string | null
  type: string
  description: string
  status: string
  createdAt: Date
}

/** The specific time actually being asked about for a pending reschedule confirmation — see lib/agents/confirmReschedule.ts's same selected-Alternative-first rule. */
export interface VoicePendingReschedule {
  segmentId: string
  segmentLabel: string
  requestedTime: Date
  feeAmount: number | null
  currency: string | null
}

export interface VoiceRecoveryRun {
  id: string
  status: string
  summary: string | null
  createdAt: Date
  segmentId: string
  segmentLabel: string
  newStatus: string
  delayMinutes: number | null
  actions: VoiceRecoveryAction[]
  /** Only present when status is RESCHEDULING — one entry per segment still awaiting the passenger's confirm/reject. */
  pendingReschedule?: VoicePendingReschedule[]
}

export interface VoiceContext {
  now: Date
  trip: { id: string; title: string; status: string }
  passengers: { name: string; isPrimary: boolean }[]
  segments: VoiceSegment[]
  recentRuns: VoiceRecoveryRun[]
  pendingApprovals: VoicePendingApproval[]
}

export interface VoiceTurnMessage {
  role: 'user' | 'assistant'
  content: string
}

/** A provider contact waiting on the passenger's OK — lets the assistant offer to approve/decline it (lib/agents/pendingApprovals.ts). */
export interface VoicePendingApproval {
  runId: string
  segmentId: string
  segmentLabel: string
  communicationId: string
  contactValue: string
  subject: string | null
  isFollowUp: boolean
}

export const PROPOSED_ACTION_KINDS = [
  'report_delay',
  'report_cancellation',
  'confirm_reschedule',
  'reject_reschedule',
  'approve_contact',
  'decline_contact',
  'check_status_now',
  'mark_resolved',
  'add_passenger',
  'update_segment',
] as const
export type ProposedActionKind = (typeof PROPOSED_ACTION_KINDS)[number]

/**
 * Something the assistant has prepared but NOT done. The chat shows it as a
 * confirmation card; only the passenger's tap runs it, through the same
 * REST endpoint (and server-side checks) as the equivalent button in the
 * app — see app/components/chat/ProposedActionCard.tsx. The model never
 * executes anything itself.
 */
export interface ProposedAction {
  kind: ProposedActionKind
  /** Exactly what confirming will do, in plain words — shown on the card. */
  title: string
  /** Supporting detail (the email subject, the new time), when useful. */
  detail: string | null
  segmentId: string
  runId: string | null
  communicationId: string | null
  /** ISO — report_delay only. */
  newDepartureTime: string | null
  /** add_passenger only (the passenger joins this trip). */
  tripId: string | null
  passenger: { name: string; email: string | null; phone: string | null } | null
  /** update_segment only — PATCH body for /api/segments/[id], restricted to EDITABLE_SEGMENT_FIELDS. */
  segmentUpdate: Partial<Record<EditableSegmentApiField, string | null>> | null
}

/** The only segment fields the assistant may propose changing — small, low-risk details. Times go through report_delay instead. */
export const EDITABLE_SEGMENT_FIELDS = {
  seat: 'seat',
  gate: 'departureGate',
  terminal: 'departureTerminal',
  confirmation_number: 'confirmationNumber',
  notes: 'notes',
} as const
export type EditableSegmentField = keyof typeof EDITABLE_SEGMENT_FIELDS
export type EditableSegmentApiField = (typeof EDITABLE_SEGMENT_FIELDS)[EditableSegmentField]

/** One of the user's trips, in brief — the assistant's view across trips (lib/voice/accountContext.ts). */
export interface VoiceTripSummary {
  id: string
  title: string
  status: string
  startsAt: Date | null
  endsAt: Date | null
  segmentCount: number
  nextSegmentLabel: string | null
  nextSegmentStartsAt: Date | null
}

/** Everything the assistant knows before any trip is in focus. */
export interface VoiceAccountContext {
  now: Date
  userName: string
  homeTimezone: string | null
  trips: VoiceTripSummary[]
  /** Decisions waiting on the user across all trips (lib/agents/needsYou.ts). */
  needsYou: { tripId: string; tripTitle: string; segmentLabel: string; headline: string; summary: string | null }[]
  /** The trip whose page the user is on, if any — the default focus. */
  pageTripId: string | null
}

/** In-app pages the assistant may take the user to. Navigation changes no data, so it runs without a confirmation card. */
export type NavigationTarget =
  | { kind: 'dashboard'; label: string }
  | { kind: 'notifications'; label: string }
  | { kind: 'trip'; tripId: string; label: string }
  | { kind: 'trip_map'; tripId: string; label: string }

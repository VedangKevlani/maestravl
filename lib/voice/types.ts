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
}

export interface VoiceRecoveryAction {
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
}

export interface VoiceTurnMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Frozen record of a mutating tool call the passenger has been told about
 * but not yet confirmed — round-tripped opaquely by the client between
 * turns (see lib/voice/pendingAction.ts and app/components/VoiceWidget.tsx).
 * toolResult is the literal propose-mode response the model already saw,
 * replayed verbatim into the next turn's conversation history so the model
 * never has to re-derive what it proposed from memory.
 */
export interface PendingVoiceAction {
  toolName: string
  toolArgs: Record<string, unknown>
  toolResult: Record<string, unknown>
}

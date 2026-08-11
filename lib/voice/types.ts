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
  monitoringStatus: string | null // formatMonitoringStatus() output, or null if never checked
  monitoringCheckedAt: Date | null
}

export interface VoiceRecoveryAction {
  type: string
  description: string
  status: string
  createdAt: Date
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

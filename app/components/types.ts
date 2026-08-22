// Plain, JSON-serializable shapes used by client components — mirrors the
// Prisma models but with Date fields as ISO strings (what actually crosses
// the server/client boundary), and no Prisma runtime imports.

export interface MonitoringDTO {
  status: string
  apiProvider: string | null
  lastCheckedAt: string | null
  lastKnownData: string | null
}

export interface SegmentDTO {
  id: string
  order: number
  transportType: string
  status: string
  provider: string | null
  identifier: string | null
  confirmationNumber: string | null
  ticketNumber: string | null
  departureLocation: string | null
  departureLocationCode: string | null
  departureTerminal: string | null
  departureGate: string | null
  departureTime: string | null
  arrivalLocation: string | null
  arrivalLocationCode: string | null
  arrivalTerminal: string | null
  arrivalTime: string | null
  timezone: string | null
  seat: string | null
  cabin: string | null
  travelClass: string | null
  currency: string | null
  price: number | null
  baggageInfo: string | null
  notes: string | null
  confidenceScores: string | null
  monitoring: MonitoringDTO | null
  passengerIds: string[]
  activeRun: ActiveRunDTO | null
}

// The one open (or most recently resolved) recovery run for this segment,
// if any — lets the boarding pass show live disruption status without a
// separate polling endpoint. See lib/constants.ts's isTerminalRunStatus for
// how "active" is chosen when a segment has more than one recent run.
export interface ActiveRunDTO {
  id: string
  status: string
  summary: string | null
  pendingRescheduleCount: number
}

export interface PassengerDTO {
  id: string
  name: string
  isPrimary: boolean
  email: string | null
  phone: string | null
  emergencyContact: string | null
}

export interface TripDTO {
  id: string
  title: string
  status: string
  passengers: PassengerDTO[]
  segments: SegmentDTO[]
}


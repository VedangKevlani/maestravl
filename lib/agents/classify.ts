// Pure disruption classification — spec section 5 (Monitor Agent output).
// Decides whether a monitoring status change is worth starting a recovery
// AgentRun over, as opposed to routine progression (ON_TIME -> BOARDING ->
// DEPARTED -> ARRIVED) that lib/monitoring/service.ts already emails the
// passenger about on its own. No DB access, no side effects — kept
// separate from lib/agents/detect.ts so it can be unit tested without a
// database, per spec section 21 ("do not require real external services to
// run the test suite").

import type { MonitoringCheckStatus } from '@/lib/monitoring/types'
import type { DisruptionSeverity } from '@/lib/constants'

// Delays shorter than this are noise — most itineraries have enough
// natural slack that a 10-15 minute flight delay changes nothing
// downstream, and creating an AgentRun (and emailing the passenger a
// second time) over it would just be alarmist. Tunable, same spirit as
// lib/dependency/graph.ts's WARNING_BUFFER_MINUTES.
export const DISRUPTION_DELAY_THRESHOLD_MINUTES = 30

export interface DisruptionClassification {
  severity: DisruptionSeverity
}

/**
 * Returns a classification if this status change is disruptive enough to
 * warrant a recovery AgentRun, or null if it's routine and the existing
 * status-change email already covers it.
 */
export function classifyDisruption(
  newStatus: MonitoringCheckStatus,
  delayMinutes: number | null
): DisruptionClassification | null {
  if (newStatus === 'CANCELLED') return { severity: 'HIGH' }

  if (newStatus === 'DELAYED') {
    const minutes = delayMinutes ?? 0
    if (minutes < DISRUPTION_DELAY_THRESHOLD_MINUTES) return null
    if (minutes >= 180) return { severity: 'HIGH' }
    if (minutes >= 60) return { severity: 'MEDIUM' }
    return { severity: 'LOW' }
  }

  return null
}

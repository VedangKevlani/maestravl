// Pure impact-analysis planner — spec section 5 (Impact Agent) and section
// 4's steps 4-9 (calculate new arrival, map dependencies, determine what's
// affected). Takes a disruption + a trip's segments and decides what
// happened and what it means, without touching the database or sending
// anything — lib/agents/orchestrator.ts is the thin DB/email wrapper around
// this, kept separate so the actual decision logic is unit-testable
// without a database (spec section 21).

import { calculateImpact, calculateCancellationImpact, type DependencySegment, type SegmentImpact } from '@/lib/dependency/graph'
import { formatMonitoringStatus } from '@/lib/monitoring/format'
import { segmentLabel } from '@/lib/segmentLabel'
import type { MonitoringCheckStatus } from '@/lib/monitoring/types'
import type { AgentActionType } from '@/lib/constants'

export interface PlannerSegment extends DependencySegment {
  identifier: string | null
  provider: string | null
  departureLocationCode: string | null
  arrivalLocationCode: string | null
}

export interface PlannedAction {
  type: AgentActionType
  segmentId: string | null
  description: string
}

export interface AnalysisPlan {
  affected: SegmentImpact[]
  actions: PlannedAction[]
  /** Whether there's anything left for Maestravl (or the passenger) to do once analysis finishes. */
  outcome: 'COMPLETED' | 'ACTION_REQUIRED'
  summary: string
}

export function planAnalysis(
  disruptedSegment: PlannerSegment,
  allSegments: PlannerSegment[],
  newStatus: MonitoringCheckStatus,
  delayMinutes: number | null
): AnalysisPlan {
  const impacts: SegmentImpact[] =
    newStatus === 'CANCELLED'
      ? calculateCancellationImpact(allSegments, disruptedSegment.id)
      : delayMinutes && delayMinutes > 0
        ? calculateImpact(allSegments, disruptedSegment.id, delayMinutes)
        : []

  const segmentsById = new Map(allSegments.map((s) => [s.id, s]))
  const actions: PlannedAction[] = [
    {
      type: 'ANALYZE_IMPACT',
      segmentId: disruptedSegment.id,
      description: `${segmentLabel(disruptedSegment)} is now ${formatMonitoringStatus(newStatus)}${
        delayMinutes ? ` (delayed ${delayMinutes}m)` : ''
      }.`,
    },
  ]

  const affected = impacts.filter((impact) => impact.level !== 'UNAFFECTED')
  for (const impact of affected) {
    const segment = segmentsById.get(impact.segmentId)
    const label = segment ? segmentLabel(segment) : 'A later segment'
    const qualifier = impact.level === 'DIRECT' ? 'directly' : 'potentially'
    actions.push({
      type: 'ANALYZE_IMPACT',
      segmentId: impact.segmentId,
      description: `${label} is ${qualifier} affected — ${impact.reason}`,
    })
  }

  if (affected.length === 0) {
    actions.push({
      type: 'VERIFY',
      segmentId: null,
      description: 'No other segments on this trip are affected by this disruption.',
    })
    return {
      affected,
      actions,
      outcome: 'COMPLETED',
      summary: 'Nothing else on your trip is affected.',
    }
  }

  actions.push({
    type: 'ESCALATE',
    segmentId: null,
    description: `Maestravl can't yet contact providers automatically — flagging ${affected.length} affected segment${
      affected.length === 1 ? '' : 's'
    } for follow-up.`,
  })

  return {
    affected,
    actions,
    outcome: 'ACTION_REQUIRED',
    summary: `${affected.length} other segment${affected.length === 1 ? '' : 's'} on your trip may be affected. Maestravl can't request changes with providers automatically yet, so please confirm directly with them for now.`,
  }
}

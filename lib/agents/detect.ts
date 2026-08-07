// Disruption detection — the DB-touching half of spec section 5's Monitor
// Agent. lib/agents/classify.ts decides *whether* a status change is
// disruptive; this module persists that decision as a Disruption row and
// starts the AgentRun that acts on it. Called from
// lib/monitoring/service.ts right after a monitoring check finds a genuine
// status change.

import { prisma } from '@/lib/db'
import { classifyDisruption } from './classify'
import { startAgentRun } from './orchestrator'
import type { MonitoringCheckResult } from '@/lib/monitoring/types'

interface DisruptedSegment {
  id: string
  tripId: string
  departureTime: Date | null
}

/**
 * Given a segment whose monitored status just changed, records a
 * Disruption (and starts a recovery AgentRun) if the change is disruptive
 * enough to act on — see classifyDisruption for the threshold. Returns
 * null for routine status changes, which the caller's existing
 * sendStatusChangeEmail already covers.
 */
export async function handleDisruptionDetection(
  segment: DisruptedSegment,
  previousStatus: string | null,
  result: MonitoringCheckResult
) {
  const classification = classifyDisruption(result.status, result.delayMinutes ?? null)
  if (!classification) return null

  const newDepartureTime =
    segment.departureTime && result.delayMinutes
      ? new Date(segment.departureTime.getTime() + result.delayMinutes * 60_000)
      : null

  const disruption = await prisma.disruption.create({
    data: {
      tripId: segment.tripId,
      segmentId: segment.id,
      previousStatus,
      newStatus: result.status,
      previousDepartureTime: segment.departureTime,
      newDepartureTime,
      delayMinutes: result.delayMinutes ?? null,
      severity: classification.severity,
      source: result.provider ?? 'unknown',
    },
  })

  await startAgentRun(disruption.id)
  return disruption
}

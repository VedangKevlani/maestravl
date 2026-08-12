// Disruption detection — the DB-touching half of spec section 5's Monitor
// Agent. lib/agents/classify.ts decides *whether* a status change is
// disruptive; this module persists that decision as a Disruption row and
// starts the AgentRun that acts on it. Called from
// lib/monitoring/service.ts right after a monitoring check finds a genuine
// status change.

import { prisma } from '@/lib/db'
import { classifyDisruption } from './classify'
import { startAgentRun } from './orchestrator'
import { isTerminalRunStatus } from '@/lib/constants'
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

  // A segment can only meaningfully have one open recovery run at a time —
  // superseding any still-open run before starting a new one prevents two
  // simultaneously "open" runs for the same segment (found via live testing
  // 2026-08-12: without this, the trip's status banner could end up showing
  // a stale, superseded run's message instead of the real latest state).
  const openRuns = await prisma.agentRun.findMany({
    where: { disruption: { segmentId: segment.id } },
  })
  for (const run of openRuns) {
    if (isTerminalRunStatus(run.status)) continue
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: 'SUPERSEDED' } })
    await prisma.agentAction.create({
      data: {
        agentRunId: run.id,
        segmentId: segment.id,
        type: 'VERIFY',
        riskLevel: 'LOW',
        status: 'EXECUTED',
        description: 'Superseded — a newer delay report came in for this segment.',
      },
    })
  }

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

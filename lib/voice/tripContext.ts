// Impure — the only DB-touching module in lib/voice/. Fetches a trip's
// full state once per turn (two queries, both lifted from existing routes:
// the trip+segments+monitoring shape from app/api/trips/[id]/route.ts, and
// the recovery-activity shape from app/api/trips/[id]/activity/route.ts)
// so the tool-calling loop in agent.ts never has to touch Prisma itself.
// Not unit tested — see lib/voice/toolExecutors.ts for the pure logic this
// feeds, which IS tested.
import { prisma } from '@/lib/db'
import { segmentLabel } from '@/lib/segmentLabel'
import { formatMonitoringStatus } from '@/lib/monitoring/format'
import type { MonitoringCheckResult } from '@/lib/monitoring/types'
import type { VoiceContext, VoiceSegment } from './types'

function parseMonitoringStatus(lastKnownData: string | null): { status: string | null; checkedAt: Date | null } {
  if (!lastKnownData) return { status: null, checkedAt: null }
  try {
    const parsed = JSON.parse(lastKnownData) as MonitoringCheckResult
    return {
      status: parsed.status ? formatMonitoringStatus(parsed.status) : null,
      checkedAt: parsed.checkedAt ? new Date(parsed.checkedAt) : null,
    }
  } catch {
    return { status: null, checkedAt: null }
  }
}

export async function loadVoiceContext(tripId: string): Promise<VoiceContext> {
  const [trip, runs] = await Promise.all([
    prisma.trip.findFirst({
      where: { id: tripId },
      include: {
        passengers: true,
        segments: { orderBy: { order: 'asc' }, include: { monitoring: true } },
      },
    }),
    prisma.agentRun.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        disruption: { include: { segment: true } },
        actions: { orderBy: { createdAt: 'asc' } },
        rescheduleRequests: { where: { status: 'REQUESTED' }, include: { segment: true } },
        alternatives: { where: { selected: true } },
      },
    }),
  ])

  if (!trip) throw new Error(`Trip ${tripId} not found`)

  const segments: VoiceSegment[] = trip.segments.map((s) => {
    const { status, checkedAt } = parseMonitoringStatus(s.monitoring?.lastKnownData ?? null)
    return {
      id: s.id,
      order: s.order,
      transportType: s.transportType,
      status: s.status,
      provider: s.provider,
      identifier: s.identifier,
      departureLocation: s.departureLocation,
      departureLocationCode: s.departureLocationCode,
      departureTime: s.departureTime,
      arrivalLocation: s.arrivalLocation,
      arrivalLocationCode: s.arrivalLocationCode,
      arrivalTime: s.arrivalTime,
      confirmationNumber: s.confirmationNumber,
      notes: s.notes,
      timezone: s.timezone,
      monitoringStatus: status,
      monitoringCheckedAt: checkedAt,
    }
  })

  return {
    now: new Date(),
    trip: { id: trip.id, title: trip.title, status: trip.status },
    passengers: trip.passengers.map((p) => ({ name: p.name, isPrimary: p.isPrimary })),
    segments,
    recentRuns: runs.map((run) => ({
      id: run.id,
      status: run.status,
      summary: run.summary,
      createdAt: run.createdAt,
      segmentId: run.disruption.segmentId,
      segmentLabel: segmentLabel(run.disruption.segment),
      newStatus: run.disruption.newStatus,
      delayMinutes: run.disruption.delayMinutes,
      actions: run.actions.map((a) => ({ type: a.type, description: a.description, status: a.status, createdAt: a.createdAt })),
      // Same selected-Alternative-first rule as lib/agents/confirmReschedule.ts
      // — a reply doesn't always accept the primary requested time.
      pendingReschedule:
        run.status === 'RESCHEDULING'
          ? run.rescheduleRequests.map((request) => {
              const selected = run.alternatives.find((a) => a.segmentId === request.segmentId)
              return {
                segmentId: request.segmentId,
                segmentLabel: segmentLabel(request.segment),
                requestedTime: selected?.proposedTime ?? request.requestedTime,
                feeAmount: request.feeAmount,
                currency: request.currency,
              }
            })
          : undefined,
    })),
  }
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'
import { segmentLabel } from '@/lib/segmentLabel'

// Backs the calm, live-updating recovery status view on the trip page
// (components/TripRecoveryStatus.tsx) — polled on an interval rather than
// pushed, since this app has no websocket/SSE infrastructure and polling a
// handful of trips every ~12s is cheap. Returns recent AgentRuns with their
// full action log and enough about the triggering disruption/segment to
// render human labels client-side without a second round trip.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id: tripId } = await params

  const trip = await prisma.trip.findFirst({ where: { id: tripId, userId: auth.userId } })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const runs = await prisma.agentRun.findMany({
    where: { tripId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      disruption: { include: { segment: true } },
      actions: { orderBy: { createdAt: 'asc' } },
    },
  })

  return NextResponse.json({
    runs: runs.map((run) => ({
      id: run.id,
      status: run.status,
      summary: run.summary,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      completedAt: run.completedAt,
      disruption: {
        segmentLabel: segmentLabel(run.disruption.segment),
        newStatus: run.disruption.newStatus,
        delayMinutes: run.disruption.delayMinutes,
      },
      actions: run.actions.map((a) => ({
        id: a.id,
        type: a.type,
        description: a.description,
        status: a.status,
        createdAt: a.createdAt,
      })),
    })),
  })
}

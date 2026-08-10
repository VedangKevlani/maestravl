import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'
import { handleDisruptionDetection } from '@/lib/agents/detect'

// Lets a trip owner manually report a disruption on one of their own
// segments — the entry point for transport modes that don't have live
// monitoring yet (train/bus/ferry adapters are still stubs, see
// docs/INTEGRATION.md) as well as the way to test the recovery pipeline
// end-to-end without waiting for a real flight delay. Feeds the exact same
// handleDisruptionDetection path a real monitoring check would, so there's
// no separate "fake" code path to keep in sync.
const ReportDisruptionSchema = z.object({
  status: z.enum(['DELAYED', 'CANCELLED']),
  delayMinutes: z.number().int().positive().max(2880).optional(), // cap at 48h — anything longer isn't a "delay", it's effectively a cancellation
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id } = await params

  const segment = await prisma.segment.findUnique({ where: { id }, include: { trip: true } })
  if (!segment || segment.trip.userId !== auth.userId) {
    return NextResponse.json({ error: 'Segment not found' }, { status: 404 })
  }

  const json = await req.json().catch(() => null)
  const parsed = ReportDisruptionSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { status, delayMinutes } = parsed.data

  const disruption = await handleDisruptionDetection(segment, segment.status, {
    status,
    delayMinutes,
    checkedAt: new Date(),
    provider: 'manual-report',
  })

  if (!disruption) {
    return NextResponse.json({
      disruption: null,
      message: 'Reported, but not disruptive enough to start a recovery run (e.g. a delay under 30 minutes).',
    })
  }

  const run = await prisma.agentRun.findFirst({
    where: { disruptionId: disruption.id },
    orderBy: { createdAt: 'desc' },
    include: { actions: { orderBy: { createdAt: 'asc' } } },
  })

  return NextResponse.json({ disruption, agentRun: run })
}

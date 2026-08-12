import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'
import { segmentLabel } from '@/lib/segmentLabel'

// Closes the loop after lib/agents/replyInterpretation.ts reads a provider's
// reply as a likely yes: the run sits in RESCHEDULING (never auto-CONFIRMED
// — spec section 20) until the passenger, having read the actual reply via
// GET .../communications, explicitly accepts or corrects the interpretation
// here. This is the only place a recovery run's own action ever rewrites a
// Segment's scheduled time — everywhere else (lib/agents/detect.ts,
// lib/monitoring/service.ts) deliberately leaves the segment's original
// schedule untouched and layers live status on top via Disruption/
// MonitoringRecord. That's safe here specifically because it's gated behind
// an explicit human confirmation, the same trust boundary the manual
// segment-edit route (app/api/segments/[id]/route.ts) already relies on —
// not an agent silently rewriting the record.
const ConfirmSchema = z.object({ accept: z.boolean() })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id } = await params

  const run = await prisma.agentRun.findUnique({ where: { id }, include: { trip: true } })
  if (!run || run.trip.userId !== auth.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (run.status !== 'RESCHEDULING') {
    return NextResponse.json({ error: 'This run has no pending reschedule to confirm.' }, { status: 409 })
  }

  const json = await req.json().catch(() => null)
  const parsed = ConfirmSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { accept } = parsed.data

  const pendingRequests = await prisma.rescheduleRequest.findMany({
    where: { agentRunId: id, status: 'REQUESTED' },
    include: { segment: true },
  })

  if (!accept) {
    await prisma.agentAction.create({
      data: {
        agentRunId: id,
        segmentId: null,
        type: 'VERIFY',
        riskLevel: 'LOW',
        status: 'EXECUTED',
        description: "You said the provider's reply didn't actually mean the reschedule was accepted — keeping this open.",
      },
    })
    const updated = await prisma.agentRun.update({
      where: { id },
      data: { status: 'ACTION_REQUIRED', summary: "Reply looked like a yes, but you said it wasn't — take another look." },
    })
    return NextResponse.json({ agentRun: updated })
  }

  for (const request of pendingRequests) {
    const segment = request.segment
    const delta = segment.departureTime ? request.requestedTime.getTime() - segment.departureTime.getTime() : null

    await prisma.segment.update({
      where: { id: segment.id },
      data: {
        departureTime: request.requestedTime,
        arrivalTime: segment.arrivalTime && delta !== null ? new Date(segment.arrivalTime.getTime() + delta) : segment.arrivalTime,
        status: 'DELAYED',
      },
    })

    await prisma.rescheduleRequest.update({
      where: { id: request.id },
      data: { status: 'CONFIRMED', respondedAt: new Date() },
    })

    await prisma.agentAction.create({
      data: {
        agentRunId: id,
        segmentId: segment.id,
        type: 'UPDATE_ITINERARY',
        riskLevel: 'LOW',
        status: 'EXECUTED',
        description: `Updated ${segmentLabel(segment)}'s scheduled time to reflect the confirmed reschedule.`,
      },
    })
  }

  const updated = await prisma.agentRun.update({
    where: { id },
    data: { status: 'CONFIRMED', summary: "Rescheduled and confirmed — your itinerary is up to date.", completedAt: new Date() },
  })

  return NextResponse.json({ agentRun: updated })
}

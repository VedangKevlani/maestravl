import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'
import { handleDisruptionDetection } from '@/lib/agents/detect'
import { getFieldProfile } from '@/app/components/segmentFieldProfiles'

// Lets a trip owner manually report a disruption on one of their own
// segments — the entry point for transport modes that don't have live
// monitoring yet (train/bus/ferry adapters are still stubs, see
// docs/INTEGRATION.md) as well as the way to test the recovery pipeline
// end-to-end without waiting for a real flight delay. Feeds the exact same
// handleDisruptionDetection path a real monitoring check would, so there's
// no separate "fake" code path to keep in sync.
//
// Takes the actual new departure time rather than a minutes-late count —
// the delay is derived here, server-side, from the segment's own scheduled
// time, so the passenger reports what they actually know (what time the
// airline/hotel/etc. now says) instead of doing the subtraction themselves.
const ReportDisruptionSchema = z.object({
  status: z.enum(['DELAYED', 'CANCELLED']),
  newDepartureTime: z.string().datetime().optional(),
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
  const { status, newDepartureTime } = parsed.data

  // "Departure time" only makes sense for route-based segments — a hotel's
  // equivalent is check-in, a restaurant's is its reservation time, etc.
  // (see app/components/segmentFieldProfiles.ts, shared with the add/edit
  // forms). segment.departureTime is still the underlying column being
  // compared for every transport type — only these messages' wording changes.
  const timeLabel = getFieldProfile(segment.transportType).departureTimeLabel
  const timeLabelLower = timeLabel.charAt(0).toLowerCase() + timeLabel.slice(1)

  let delayMinutes: number | undefined
  if (status === 'DELAYED') {
    if (!newDepartureTime) {
      return NextResponse.json({ error: `Enter the new ${timeLabelLower}.` }, { status: 400 })
    }
    if (!segment.departureTime) {
      return NextResponse.json(
        { error: `This segment doesn't have a scheduled ${timeLabelLower} on file — set one first (Edit), then report the delay.` },
        { status: 400 }
      )
    }
    delayMinutes = Math.round((new Date(newDepartureTime).getTime() - segment.departureTime.getTime()) / 60_000)
    if (delayMinutes <= 0) {
      return NextResponse.json({ error: `The new ${timeLabelLower} must be after the originally scheduled time.` }, { status: 400 })
    }
    if (delayMinutes > 2880) {
      // Cap at 48h — anything longer isn't really a "delay" anymore.
      return NextResponse.json({ error: "That's more than 48 hours later — report this as cancelled instead." }, { status: 400 })
    }
  }

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

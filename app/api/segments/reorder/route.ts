import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'

const ReorderSchema = z.object({
  tripId: z.string().min(1),
  orderedSegmentIds: z.array(z.string()).min(1),
})

export async function POST(req: Request) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error

  const json = await req.json().catch(() => null)
  const parsed = ReorderSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { tripId, orderedSegmentIds } = parsed.data

  const trip = await prisma.trip.findFirst({ where: { id: tripId, userId: auth.userId }, include: { segments: true } })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const validIds = new Set(trip.segments.map((s) => s.id))
  if (orderedSegmentIds.length !== trip.segments.length || !orderedSegmentIds.every((id) => validIds.has(id))) {
    return NextResponse.json({ error: 'orderedSegmentIds must exactly match the trip\'s segments' }, { status: 400 })
  }

  await prisma.$transaction(
    orderedSegmentIds.map((segmentId, index) =>
      prisma.segment.update({ where: { id: segmentId }, data: { order: index } })
    )
  )

  return NextResponse.json({ ok: true })
}

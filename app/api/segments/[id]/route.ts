import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'
import { initializeMonitoringForSegment } from '@/lib/monitoring/service'

const TRANSPORT_TYPES = [
  'FLIGHT', 'TRAIN', 'BUS', 'TAXI', 'FERRY', 'CRUISE', 'BOAT',
  'HELICOPTER', 'BICYCLE', 'RENTAL_CAR', 'WALKING', 'HOTEL', 'RESTAURANT',
  'EXCURSION', 'OTHER',
] as const

const SEGMENT_STATUSES = ['SCHEDULED', 'BOARDING', 'DEPARTED', 'DELAYED', 'CANCELLED', 'ARRIVED', 'COMPLETED'] as const

const UpdateSegmentSchema = z.object({
  order: z.number().int().optional(),
  transportType: z.enum(TRANSPORT_TYPES).optional(),
  status: z.enum(SEGMENT_STATUSES).optional(),
  provider: z.string().trim().max(150).nullable().optional(),
  identifier: z.string().trim().max(50).nullable().optional(),
  confirmationNumber: z.string().trim().max(50).nullable().optional(),
  ticketNumber: z.string().trim().max(50).nullable().optional(),
  departureLocation: z.string().trim().max(200).nullable().optional(),
  departureLocationCode: z.string().trim().max(10).nullable().optional(),
  departureTerminal: z.string().trim().max(20).nullable().optional(),
  departureGate: z.string().trim().max(20).nullable().optional(),
  departureTime: z.string().datetime().nullable().optional(),
  arrivalLocation: z.string().trim().max(200).nullable().optional(),
  arrivalLocationCode: z.string().trim().max(10).nullable().optional(),
  arrivalTerminal: z.string().trim().max(20).nullable().optional(),
  arrivalTime: z.string().datetime().nullable().optional(),
  timezone: z.string().trim().max(50).nullable().optional(),
  seat: z.string().trim().max(20).nullable().optional(),
  cabin: z.string().trim().max(50).nullable().optional(),
  travelClass: z.string().trim().max(50).nullable().optional(),
  currency: z.string().trim().max(10).nullable().optional(),
  price: z.number().nonnegative().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  baggageInfo: z.string().trim().max(500).nullable().optional(),
})

async function findOwnedSegment(segmentId: string, userId: string) {
  const segment = await prisma.segment.findUnique({ where: { id: segmentId }, include: { trip: true } })
  if (!segment || segment.trip.userId !== userId) return null
  return segment
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id } = await params

  const existing = await findOwnedSegment(id, auth.userId)
  if (!existing) return NextResponse.json({ error: 'Segment not found' }, { status: 404 })

  const json = await req.json().catch(() => null)
  const parsed = UpdateSegmentSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const data = parsed.data

  // A user editing a field is a confirmation/override — drop it from the
  // confidence map and the review queue so it never re-surfaces as "unsure".
  let confidenceScores: Record<string, number> = {}
  try {
    confidenceScores = existing.confidenceScores ? JSON.parse(existing.confidenceScores) : {}
  } catch {
    confidenceScores = {}
  }
  for (const key of Object.keys(data)) {
    if (key in confidenceScores) delete confidenceScores[key]
  }

  const updateData: Record<string, unknown> = { ...data, confidenceScores: JSON.stringify(confidenceScores) }
  if ('departureTime' in data) updateData.departureTime = data.departureTime ? new Date(data.departureTime) : null
  if ('arrivalTime' in data) updateData.arrivalTime = data.arrivalTime ? new Date(data.arrivalTime) : null

  const segment = await prisma.segment.update({ where: { id }, data: updateData })

  if (data.transportType && data.transportType !== existing.transportType) {
    await initializeMonitoringForSegment(segment.id)
  }

  return NextResponse.json({ segment })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id } = await params

  const existing = await findOwnedSegment(id, auth.userId)
  if (!existing) return NextResponse.json({ error: 'Segment not found' }, { status: 404 })

  await prisma.segment.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

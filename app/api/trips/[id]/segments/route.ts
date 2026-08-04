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

const CreateSegmentSchema = z.object({
  transportType: z.enum(TRANSPORT_TYPES),
  provider: z.string().trim().max(150).optional(),
  identifier: z.string().trim().max(50).optional(),
  confirmationNumber: z.string().trim().max(50).optional(),
  ticketNumber: z.string().trim().max(50).optional(),
  departureLocation: z.string().trim().max(200).optional(),
  departureLocationCode: z.string().trim().max(10).optional(),
  departureTerminal: z.string().trim().max(20).optional(),
  departureGate: z.string().trim().max(20).optional(),
  departureTime: z.string().datetime().optional().or(z.literal('')),
  arrivalLocation: z.string().trim().max(200).optional(),
  arrivalLocationCode: z.string().trim().max(10).optional(),
  arrivalTerminal: z.string().trim().max(20).optional(),
  arrivalTime: z.string().datetime().optional().or(z.literal('')),
  timezone: z.string().trim().max(50).optional(),
  seat: z.string().trim().max(20).optional(),
  cabin: z.string().trim().max(50).optional(),
  travelClass: z.string().trim().max(50).optional(),
  currency: z.string().trim().max(10).optional(),
  price: z.number().nonnegative().optional(),
  notes: z.string().trim().max(2000).optional(),
  baggageInfo: z.string().trim().max(500).optional(),
  passengerIds: z.array(z.string()).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id: tripId } = await params

  const trip = await prisma.trip.findFirst({ where: { id: tripId, userId: auth.userId } })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const json = await req.json().catch(() => null)
  const parsed = CreateSegmentSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const data = parsed.data

  const maxOrder = await prisma.segment.aggregate({ where: { tripId }, _max: { order: true } })
  const order = (maxOrder._max.order ?? -1) + 1

  const segment = await prisma.segment.create({
    data: {
      tripId,
      order,
      transportType: data.transportType,
      provider: data.provider || null,
      identifier: data.identifier || null,
      confirmationNumber: data.confirmationNumber || null,
      ticketNumber: data.ticketNumber || null,
      departureLocation: data.departureLocation || null,
      departureLocationCode: data.departureLocationCode || null,
      departureTerminal: data.departureTerminal || null,
      departureGate: data.departureGate || null,
      departureTime: data.departureTime ? new Date(data.departureTime) : null,
      arrivalLocation: data.arrivalLocation || null,
      arrivalLocationCode: data.arrivalLocationCode || null,
      arrivalTerminal: data.arrivalTerminal || null,
      arrivalTime: data.arrivalTime ? new Date(data.arrivalTime) : null,
      timezone: data.timezone || null,
      seat: data.seat || null,
      cabin: data.cabin || null,
      travelClass: data.travelClass || null,
      currency: data.currency || null,
      price: data.price ?? null,
      notes: data.notes || null,
      baggageInfo: data.baggageInfo || null,
      passengerLinks: data.passengerIds?.length
        ? { create: data.passengerIds.map((passengerId) => ({ passengerId })) }
        : undefined,
    },
    include: { passengerLinks: { include: { passenger: true } } },
  })

  await initializeMonitoringForSegment(segment.id)

  return NextResponse.json({ segment }, { status: 201 })
}

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'

const CreatePassengerSchema = z.object({
  name: z.string().trim().min(1).max(150),
  isPrimary: z.boolean().optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional(),
  emergencyContact: z.string().trim().max(200).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id: tripId } = await params

  const trip = await prisma.trip.findFirst({ where: { id: tripId, userId: auth.userId } })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const json = await req.json().catch(() => null)
  const parsed = CreatePassengerSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const passenger = await prisma.passenger.create({
    data: {
      tripId,
      name: parsed.data.name,
      isPrimary: parsed.data.isPrimary ?? false,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      emergencyContact: parsed.data.emergencyContact || null,
    },
  })

  return NextResponse.json({ passenger }, { status: 201 })
}

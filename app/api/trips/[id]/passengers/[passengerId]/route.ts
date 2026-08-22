import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'

const UpdatePassengerSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  isPrimary: z.boolean().optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  emergencyContact: z.string().trim().max(200).optional().or(z.literal('')),
})

async function findOwnedPassenger(tripId: string, passengerId: string, userId: string) {
  const passenger = await prisma.passenger.findFirst({
    where: { id: passengerId, tripId, trip: { userId } },
  })
  return passenger
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; passengerId: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id: tripId, passengerId } = await params

  const existing = await findOwnedPassenger(tripId, passengerId, auth.userId)
  if (!existing) return NextResponse.json({ error: 'Passenger not found' }, { status: 404 })

  const json = await req.json().catch(() => null)
  const parsed = UpdatePassengerSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  // Partial update — only touch fields the client actually sent, so an
  // email-only edit can't silently null out a phone number that was set
  // separately, and vice versa.
  const data: {
    name?: string
    isPrimary?: boolean
    email?: string | null
    phone?: string | null
    emergencyContact?: string | null
  } = {}
  if ('name' in parsed.data) data.name = parsed.data.name
  if ('isPrimary' in parsed.data) data.isPrimary = parsed.data.isPrimary
  if ('email' in parsed.data) data.email = parsed.data.email || null
  if ('phone' in parsed.data) data.phone = parsed.data.phone || null
  if ('emergencyContact' in parsed.data) data.emergencyContact = parsed.data.emergencyContact || null

  const passenger = await prisma.passenger.update({
    where: { id: passengerId },
    data,
  })

  return NextResponse.json({ passenger })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; passengerId: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id: tripId, passengerId } = await params

  const existing = await findOwnedPassenger(tripId, passengerId, auth.userId)
  if (!existing) return NextResponse.json({ error: 'Passenger not found' }, { status: 404 })

  // A trip must always have at least one passenger — refuse to delete the
  // last one rather than leaving a trip with none.
  const remaining = await prisma.passenger.count({ where: { tripId } })
  if (remaining <= 1) {
    return NextResponse.json({ error: 'A trip must have at least one passenger.' }, { status: 400 })
  }

  await prisma.passenger.delete({ where: { id: passengerId } })
  return NextResponse.json({ ok: true })
}

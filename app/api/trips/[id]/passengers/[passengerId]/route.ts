import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'

const UpdatePassengerSchema = z.object({
  email: z.string().trim().email().optional().or(z.literal('')),
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

  const passenger = await prisma.passenger.update({
    where: { id: passengerId },
    data: { email: parsed.data.email || null },
  })

  return NextResponse.json({ passenger })
}

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'

export async function GET() {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error

  const trips = await prisma.trip.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: 'desc' },
    include: {
      passengers: true,
      segments: {
        orderBy: { order: 'asc' },
        include: { monitoring: true },
      },
    },
  })

  return NextResponse.json({ trips })
}

const CreateTripSchema = z.object({
  title: z.string().trim().min(1).max(200),
})

export async function POST(req: Request) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error

  const json = await req.json().catch(() => null)
  const parsed = CreateTripSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const trip = await prisma.trip.create({
    data: { title: parsed.data.title, userId: auth.userId },
  })

  return NextResponse.json({ trip }, { status: 201 })
}

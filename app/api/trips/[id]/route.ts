import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id } = await params

  const trip = await prisma.trip.findFirst({
    where: { id, userId: auth.userId },
    include: {
      passengers: true,
      documents: true,
      segments: {
        orderBy: { order: 'asc' },
        include: { monitoring: true, passengerLinks: { include: { passenger: true } } },
      },
    },
  })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  return NextResponse.json({ trip })
}

const UpdateTripSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id } = await params

  const existing = await prisma.trip.findFirst({ where: { id, userId: auth.userId } })
  if (!existing) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const json = await req.json().catch(() => null)
  const parsed = UpdateTripSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const trip = await prisma.trip.update({ where: { id }, data: parsed.data })
  return NextResponse.json({ trip })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id } = await params

  const existing = await prisma.trip.findFirst({ where: { id, userId: auth.userId } })
  if (!existing) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  await prisma.trip.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

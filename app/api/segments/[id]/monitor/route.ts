import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'
import { runMonitoringCheck } from '@/lib/monitoring/service'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id } = await params

  const segment = await prisma.segment.findUnique({ where: { id }, include: { trip: true } })
  if (!segment || segment.trip.userId !== auth.userId) {
    return NextResponse.json({ error: 'Segment not found' }, { status: 404 })
  }

  const record = await runMonitoringCheck(id)
  return NextResponse.json({ monitoring: record })
}

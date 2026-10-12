import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'
import { loadTripActivity } from '@/lib/trips/activityFeed'

// Backs the per-segment "Trip Segment Updates" modal and its unread dot
// (app/components/SegmentUpdatesModal.tsx, useSegmentUnreadUpdates.ts) —
// the same feed the trip page's "Trip Updates" tab renders (see
// lib/trips/activityFeed.ts). Oldest first, as the modal groups by day.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id: tripId } = await params

  const trip = await prisma.trip.findFirst({ where: { id: tripId, userId: auth.userId }, select: { id: true } })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const entries = await loadTripActivity(tripId)
  const activities = entries
    .map((e) => ({ id: e.id, segmentId: e.segmentId, createdAt: e.createdAt.toISOString(), type: e.type, message: e.message }))
    .reverse()

  return NextResponse.json({ activities })
}

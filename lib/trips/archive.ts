// Trip lifecycle: moves a trip to COMPLETED (shown in the dashboard's
// "Archived" section — see app/(app)/dashboard/page.tsx) once every one of
// its segments is finished. Deliberately not tied to flight-monitoring
// events — most segment types (hotel, restaurant, taxi, etc.) are never
// monitored at all (see docs/INTEGRATION.md), so "is this trip over" has
// to be answerable from each segment's own scheduled time, not from
// monitoring coverage. Called from the monitoring cron (app/api/cron/monitoring)
// so it runs on the same cadence without needing its own scheduler.

import { prisma } from '@/lib/db'

// How long past a segment's scheduled end to wait before counting it as
// finished — generous enough to absorb a late landing or a checkout
// running over, without leaving a genuinely finished trip cluttering the
// active list indefinitely.
const ARCHIVE_BUFFER_MS = 1000 * 60 * 60 * 6

interface ArchivableSegment {
  status: string
  departureTime: Date | null
  arrivalTime: Date | null
}

function isSegmentFinished(segment: ArchivableSegment): boolean {
  if (segment.status === 'CANCELLED') return true
  const end = segment.arrivalTime ?? segment.departureTime
  // Unknown timing — never assume a segment is done just because we can't
  // tell; that would risk archiving a trip that still has something
  // pending (per spec section 20, don't fake a result you don't have).
  if (!end) return false
  return Date.now() - end.getTime() > ARCHIVE_BUFFER_MS
}

/** Archives (marks COMPLETED) every UPCOMING/ACTIVE trip whose segments are all finished. Never touches a trip already COMPLETED or CANCELLED. */
export async function archiveFinishedTrips() {
  const trips = await prisma.trip.findMany({
    where: { status: { in: ['UPCOMING', 'ACTIVE'] } },
    select: { id: true, segments: { select: { status: true, departureTime: true, arrivalTime: true } } },
  })

  const finishedTripIds = trips
    .filter((trip) => trip.segments.length > 0 && trip.segments.every(isSegmentFinished))
    .map((trip) => trip.id)

  if (finishedTripIds.length === 0) return { archived: 0 }

  await prisma.trip.updateMany({
    where: { id: { in: finishedTripIds } },
    data: { status: 'COMPLETED' },
  })
  return { archived: finishedTripIds.length }
}

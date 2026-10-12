// Impure — what the assistant knows about the user before any one trip is
// in focus: their trips in brief, and decisions waiting on them (the same
// loadNeedsYou the dashboard inbox uses, so the two can't disagree). Loaded
// once per turn by app/api/voice/route.ts. Only ever this user's own data.
import { prisma } from '@/lib/db'
import { loadNeedsYou } from '@/lib/agents/needsYou'
import { displaySegmentLabel } from '@/lib/segmentLabel'
import type { VoiceAccountContext } from './types'

const MAX_TRIPS = 30

export async function loadAccountContext(userId: string, pageTripId: string | null): Promise<VoiceAccountContext> {
  const now = new Date()
  const [user, trips, needsYou] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, homeTimezone: true } }),
    prisma.trip.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: MAX_TRIPS,
      select: {
        id: true,
        title: true,
        status: true,
        segments: {
          orderBy: { order: 'asc' },
          select: { identifier: true, provider: true, departureLocationCode: true, arrivalLocationCode: true, transportType: true, departureLocation: true, departureTime: true, arrivalTime: true, status: true },
        },
      },
    }),
    loadNeedsYou(userId),
  ])

  return {
    now,
    userName: user?.name ?? '',
    homeTimezone: user?.homeTimezone ?? null,
    pageTripId,
    trips: trips.map((t) => {
      const times = t.segments.flatMap((s) => [s.departureTime, s.arrivalTime]).filter((d): d is Date => d !== null)
      const next = t.segments
        .filter((s) => s.departureTime && s.departureTime > now && s.status !== 'CANCELLED')
        .sort((a, b) => a.departureTime!.getTime() - b.departureTime!.getTime())[0]
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        startsAt: times.length ? new Date(Math.min(...times.map((d) => d.getTime()))) : null,
        endsAt: times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : null,
        segmentCount: t.segments.length,
        nextSegmentLabel: next ? displaySegmentLabel(next) : null,
        nextSegmentStartsAt: next?.departureTime ?? null,
      }
    }),
    needsYou: needsYou.map((n) => ({ tripId: n.tripId, tripTitle: n.tripTitle, segmentLabel: n.segmentLabel, headline: n.headline, summary: n.summary })),
  }
}

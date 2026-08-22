import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'

// Backs the unread-notification dot on the bell icon in AppHeader.
// There's no persisted "read" state on NotificationLog (no readAt/read
// column in the schema) — the client tracks its own "last seen" timestamp
// (localStorage) and asks how many logs landed after it. Lightweight and
// migration-free, at the cost of not syncing "read" across devices; if
// that's ever needed, swap this for a real readAt column + PATCH route.
export async function GET(req: NextRequest) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error

  const sinceParam = req.nextUrl.searchParams.get('since')
  const since = sinceParam ? new Date(sinceParam) : null
  const sinceValid = since && !isNaN(since.getTime())

  const [count, latest] = await Promise.all([
    prisma.notificationLog.count({
      where: {
        trip: { userId: auth.userId },
        ...(sinceValid ? { createdAt: { gt: since! } } : {}),
      },
    }),
    prisma.notificationLog.findFirst({
      where: { trip: { userId: auth.userId } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ])

  return NextResponse.json({
    count,
    latestCreatedAt: latest?.createdAt.toISOString() ?? null,
  })
}

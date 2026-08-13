import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'

// Marks the interactive onboarding tour (app/components/onboarding/) as
// dismissed — called when it finishes naturally or the passenger skips it.
// Kept separate from PATCH /api/user (whose schema requires homeTimezone)
// rather than folded in — a distinct, narrower concern, same convention as
// this app's other single-purpose routes (passengers, segments, monitor).
export async function POST() {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error

  await prisma.user.update({
    where: { id: auth.userId },
    data: { onboardingCompletedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}

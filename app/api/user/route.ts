import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'

// Home timezone for the world-clock feature (app/components/HomeTimezoneBadge.tsx)
// — set once, auto-suggested from the browser, editable any time.
const PatchUserSchema = z.object({
  homeTimezone: z.string().trim().min(1).max(100),
})

function isValidIanaTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export async function PATCH(req: Request) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error

  const json = await req.json().catch(() => null)
  const parsed = PatchUserSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  if (!isValidIanaTimezone(parsed.data.homeTimezone)) {
    return NextResponse.json({ error: 'Not a recognized time zone.' }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data: { homeTimezone: parsed.data.homeTimezone },
    select: { homeTimezone: true },
  })

  return NextResponse.json({ homeTimezone: user.homeTimezone })
}

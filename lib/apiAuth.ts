import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

/** Resolves the current session's user id, or returns a 401 response to short-circuit the route handler. */
export async function requireUserId(): Promise<{ userId: string } | { error: NextResponse }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { userId: session.user.id }
}

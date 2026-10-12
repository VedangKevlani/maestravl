import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin'

/** Resolves the current session's user id, or returns a 401 response to short-circuit the route handler. */
export async function requireUserId(): Promise<{ userId: string } | { error: NextResponse }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { userId: session.user.id }
}

/** Like requireUserId, but also requires a developer account (see lib/admin.ts). Non-admins get 404, not 403, so admin routes don't advertise themselves. */
export async function requireAdmin(): Promise<{ userId: string } | { error: NextResponse }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!isAdminEmail(session.user.email)) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  return { userId: session.user.id }
}

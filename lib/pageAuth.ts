import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

/**
 * The signed-in user's id for a page under app/(app), or a redirect to
 * /login. The (app) layout redirects too, but Next renders a page in
 * parallel with its layout, so a page can't assume the layout's check ran
 * first — `session!.user.id` crashed (and logged an error) for every
 * signed-out visit before the redirect landed.
 */
export async function requirePageUserId(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  return session.user.id
}

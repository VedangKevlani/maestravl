import { notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin'
import SystemHealthClient from './SystemHealthClient'

// Developer-only: integration configuration and cross-account evidence
// counts aren't something a traveller needs, and the counts span every
// account. Non-admins get a plain 404 rather than an "access denied" page,
// so the route doesn't advertise itself. GET /api/system/health is gated
// the same way (lib/apiAuth.ts's requireAdmin).
export default async function SystemHealthPage() {
  const session = await auth()
  if (!isAdminEmail(session?.user?.email)) notFound()
  return <SystemHealthClient />
}

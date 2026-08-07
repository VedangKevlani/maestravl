import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth, signOut } from '@/lib/auth'
import AuthSessionProvider from '../components/AuthSessionProvider'
import MaestravlMark from '../components/MaestravlMark'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <AuthSessionProvider>
      <div style={{ background: 'var(--charcoal)', minHeight: '100vh' }}>
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <MaestravlMark size={22} />
            <span className="text-label text-white/70 tracking-widest">MAESTRAVL</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/notifications" className="text-label text-white/40 hover:text-white/80 transition-colors">
              Notifications
            </Link>
            <span className="text-editorial text-white/40" style={{ fontSize: '0.85rem' }}>{session.user.email}</span>
            <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }}>
              <button type="submit" className="text-label text-white/40 hover:text-white/80 transition-colors">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="px-6 py-10 max-w-5xl mx-auto">{children}</main>
      </div>
    </AuthSessionProvider>
  )
}

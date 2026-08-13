import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth, signOut } from '@/lib/auth'
import { prisma } from '@/lib/db'
import AuthSessionProvider from '../components/AuthSessionProvider'
import MaestravlMark from '../components/MaestravlMark'
import { OnboardingProvider } from '../components/onboarding/OnboardingProvider'
import OnboardingOverlay from '../components/onboarding/OnboardingOverlay'
import RestartTourButton from '../components/onboarding/RestartTourButton'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { onboardingCompletedAt: true } })

  return (
    <AuthSessionProvider>
      <OnboardingProvider showByDefault={!user?.onboardingCompletedAt}>
        <div style={{ background: 'var(--charcoal)', minHeight: '100vh' }}>
          <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6 sm:py-4 border-b border-white/8">
            <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
              <MaestravlMark size={20} />
              <span className="text-label text-white/70 tracking-widest whitespace-nowrap" style={{ fontSize: '0.65rem' }}>MAESTRAVL</span>
            </Link>
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 sm:gap-x-4 min-w-0">
              <RestartTourButton />
              <Link href="/notifications" className="text-label text-white/40 hover:text-white/80 transition-colors whitespace-nowrap" style={{ fontSize: '0.65rem' }}>
                Notifications
              </Link>
              <Link href="/system-health" className="text-label text-white/40 hover:text-white/80 transition-colors whitespace-nowrap" style={{ fontSize: '0.65rem' }}>
                <span className="hidden sm:inline">System status</span>
                <span className="sm:hidden">Status</span>
              </Link>
              <span className="text-editorial text-white/40 truncate max-w-[8rem] sm:max-w-[16rem]" style={{ fontSize: '0.8rem' }}>
                {session.user.email}
              </span>
              <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }} className="shrink-0">
                <button type="submit" className="text-label text-white/40 hover:text-white/80 transition-colors whitespace-nowrap" style={{ fontSize: '0.65rem' }}>
                  Sign out
                </button>
              </form>
            </div>
          </header>
          <main className="px-4 py-6 sm:px-6 sm:py-10 max-w-5xl mx-auto">{children}</main>
        </div>
        <OnboardingOverlay />
      </OnboardingProvider>
    </AuthSessionProvider>
  )
}

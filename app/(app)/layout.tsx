import { redirect } from 'next/navigation'
import { auth, signOut } from '@/lib/auth'
import { prisma } from '@/lib/db'
import AuthSessionProvider from '../components/AuthSessionProvider'
import AppHeader from '../components/AppHeader'
import { OnboardingProvider } from '../components/onboarding/OnboardingProvider'
import OnboardingOverlay from '../components/onboarding/OnboardingOverlay'
import { ChatProvider } from '../components/chat/ChatProvider'
import ChatPopup from '../components/chat/ChatPopup'
import styles from '../styles/appShell.module.css'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { onboardingCompletedAt: true } })

  async function handleSignOut() {
    'use server'
    await signOut({ redirectTo: '/login' })
  }

  return (
    <AuthSessionProvider>
      <OnboardingProvider showByDefault={!user?.onboardingCompletedAt}>
        <ChatProvider>
          <div className={styles.page}>
            <AppHeader userEmail={session.user.email ?? ''} signOutAction={handleSignOut} />
            <main className={styles.main}>{children}</main>
          </div>
          <OnboardingOverlay />
          <ChatPopup />
        </ChatProvider>
      </OnboardingProvider>
    </AuthSessionProvider>
  )
}

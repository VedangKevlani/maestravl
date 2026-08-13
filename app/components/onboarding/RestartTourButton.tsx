'use client'
import { useRouter } from 'next/navigation'
import { useOnboarding } from './OnboardingProvider'

/** Replay entry point for anyone who dismissed the tour and wants it back — lives in the header next to Sign out. */
export default function RestartTourButton() {
  const router = useRouter()
  const { restart } = useOnboarding()

  function handleClick() {
    restart()
    // The first step only shows on /dashboard — jump there so restarting
    // from a trip page doesn't just wait invisibly for a navigation that
    // may never come.
    router.push('/dashboard')
  }

  return (
    <button type="button" onClick={handleClick} className="text-label text-white/40 hover:text-white/80 transition-colors whitespace-nowrap" style={{ fontSize: '0.65rem' }}>
      Take the tour
    </button>
  )
}

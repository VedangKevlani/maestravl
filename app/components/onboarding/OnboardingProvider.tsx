'use client'
// State for the interactive onboarding tour (see steps.ts for content,
// OnboardingOverlay.tsx for rendering). Mounted once in app/(app)/layout.tsx
// so it survives client-side navigation between /dashboard, /trips/new, and
// /trips/[id] — a shared layout doesn't remount on sibling navigation,
// which is what lets a step like "click + New Trip" carry across the page
// change to the next step instead of resetting.
import { createContext, useCallback, useContext, useState } from 'react'
import { TOUR_STEPS } from './steps'

interface OnboardingContextValue {
  active: boolean
  stepIndex: number
  totalSteps: number
  /** Move to the next step, or finish (same as dismiss) if this was the last one. */
  advance: () => void
  /** Ends the tour and persists that it's been seen — used by both "Skip tour" and finishing the last step. */
  dismiss: () => void
  /** Replays from the first step. Purely client-side — an explicit "show me again," not a change to whether onboarding is considered complete. */
  restart: () => void
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

async function markOnboardingComplete() {
  try {
    await fetch('/api/user/onboarding', { method: 'POST' })
  } catch {
    // Best-effort — worst case the tour just shows again next login, which
    // is a fine fallback, not a real failure worth surfacing.
  }
}

export function OnboardingProvider({ showByDefault, children }: { showByDefault: boolean; children: React.ReactNode }) {
  const [active, setActive] = useState(showByDefault)
  const [stepIndex, setStepIndex] = useState(0)

  const dismiss = useCallback(() => {
    setActive(false)
    void markOnboardingComplete()
  }, [])

  const advance = useCallback(() => {
    setStepIndex((i) => {
      const next = i + 1
      if (next >= TOUR_STEPS.length) {
        dismiss()
        return i
      }
      return next
    })
  }, [dismiss])

  const restart = useCallback(() => {
    setStepIndex(0)
    setActive(true)
  }, [])

  return (
    <OnboardingContext.Provider value={{ active, stepIndex, totalSteps: TOUR_STEPS.length, advance, dismiss, restart }}>
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider')
  return ctx
}

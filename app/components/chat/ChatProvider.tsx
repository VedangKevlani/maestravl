'use client'
// State for the floating chat popup (see ChatPopup.tsx for rendering).
// Mounted once in app/(app)/layout.tsx, same pattern as OnboardingProvider,
// so the popup survives client-side nav between sibling (app) routes
// instead of remounting/closing on every page change.
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

interface ChatContextValue {
  open: boolean
  tripId: string | null
  toggle: (tripId: string | null) => void
  close: () => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [tripId, setTripId] = useState<string | null>(null)
  const pathname = usePathname()

  // Toggling from a different trip than the one currently open re-opens
  // (rather than closes) scoped to the new trip, instead of leaving the
  // popup open on stale trip context.
  const toggle = useCallback((nextTripId: string | null) => {
    setTripId((current) => {
      setOpen((wasOpen) => (current === nextTripId ? !wasOpen : true))
      return nextTripId
    })
  }, [])

  const close = useCallback(() => setOpen(false), [])

  // The popup is scoped to a single trip, so it shouldn't survive a
  // navigation away from that trip's page — same rule AppHeader already
  // uses to decide whether to even show the chat icon (`tripId` from the
  // `/^\/trips\/([^/]+)/` match on the current pathname). Without this,
  // leaving the trip page (back to the dashboard, another trip, etc.)
  // left a stale "Chat with Maestro" popup floating over unrelated pages.
  useEffect(() => {
    if (!open || !tripId) return
    const stillOnThisTrip = pathname?.startsWith(`/trips/${tripId}`)
    if (!stillOnThisTrip) setOpen(false)
  }, [pathname, open, tripId])

  return <ChatContext.Provider value={{ open, tripId, toggle, close }}>{children}</ChatContext.Provider>
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within ChatProvider')
  return ctx
}

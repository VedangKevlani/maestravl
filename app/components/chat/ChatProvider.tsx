'use client'
// State for the floating chat popup (see ChatPopup.tsx for rendering).
// Mounted once in app/(app)/layout.tsx, same pattern as OnboardingProvider,
// so the popup survives client-side nav between sibling (app) routes
// instead of remounting/closing on every page change.
import { createContext, useCallback, useContext, useState } from 'react'

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

  return <ChatContext.Provider value={{ open, tripId, toggle, close }}>{children}</ChatContext.Provider>
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within ChatProvider')
  return ctx
}

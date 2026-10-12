'use client'
// State for the floating chat popup (see ChatPopup.tsx for rendering).
// Mounted once in app/(app)/layout.tsx, so the popup — and the
// conversation in it — survives client-side navigation. The assistant
// works on every page; the trip page you're on is just its default focus
// (ChatPopup reads that from the URL), so it no longer closes when you
// leave a trip.
import { createContext, useCallback, useContext, useState } from 'react'

interface ChatContextValue {
  open: boolean
  toggle: () => void
  close: () => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => setOpen((o) => !o), [])
  const close = useCallback(() => setOpen(false), [])
  return <ChatContext.Provider value={{ open, toggle, close }}>{children}</ChatContext.Provider>
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within ChatProvider')
  return ctx
}

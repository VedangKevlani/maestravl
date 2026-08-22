'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmDialog from './ConfirmDialog'

export default function TripCardMenu({ tripId, tripTitle, redirectTo }: { tripId: string; tripTitle: string; redirectTo?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function handleDeleteClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setConfirmOpen(true)
  }

  async function handleDeleteConfirmed() {
    setDeleting(true)
    const res = await fetch(`/api/trips/${tripId}`, { method: 'DELETE' })
    setDeleting(false)
    setConfirmOpen(false)
    if (!res.ok) {
      alert('Could not delete this trip. Please try again.')
      return
    }
    setOpen(false)
    if (redirectTo) router.push(redirectTo)
    else router.refresh()
  }

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v) }}
        aria-label="Trip options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center justify-center w-8 h-8 rounded-full text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors shrink-0"
      >
        <svg width="16" height="16" viewBox="0 0 4 16" fill="currentColor" aria-hidden="true">
          <circle cx="2" cy="2" r="2" />
          <circle cx="2" cy="8" r="2" />
          <circle cx="2" cy="14" r="2" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="glass-card absolute right-0 top-10 z-20 py-1.5 min-w-[9.5rem] overflow-hidden"
          style={{ background: 'rgba(24,24,24,0.96)' }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleDeleteClick}
            disabled={deleting}
            className="w-full text-left px-4 py-2.5 text-editorial text-red-400 hover:bg-white/5 disabled:opacity-50 transition-colors"
            style={{ fontSize: '0.85rem' }}
          >
            {deleting ? 'Deleting…' : 'Delete trip'}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Delete trip?"
        message={`Delete "${tripTitle}"? This removes its segments, passengers, and imported documents. This can't be undone.`}
        confirmLabel="Delete trip"
        danger
        loading={deleting}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}

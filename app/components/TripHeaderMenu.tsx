'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EllipsisVertical, Trash2 } from 'lucide-react'
import ConfirmDialog from './ConfirmDialog'
import styles from '../styles/trip.module.css'

// Trip-detail-page header menu — same popover shape as the dashboard's
// DashTripCardMenu (both port new-frontend-src's .trip-card-menu /
// .trip-card-menu-pop), but redirects to /dashboard on delete since
// there's no card to stay on.
export default function TripHeaderMenu({ tripId, tripTitle }: { tripId: string; tripTitle: string }) {
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
    router.push('/dashboard')
  }

  return (
    <div ref={ref} className={styles.tripCardMenu}>
      <button
        type="button"
        className={styles.tripCardMenuBtn}
        aria-label="Trip options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <EllipsisVertical size={16} strokeWidth={2} />
      </button>

      {open && (
        <div role="menu" className={styles.tripCardMenuPop}>
          <button type="button" role="menuitem" onClick={handleDeleteClick} disabled={deleting}>
            <Trash2 size={13} strokeWidth={2} />
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

'use client'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import styles from '../styles/trip.module.css'

/**
 * The "Manage" modal for a single trip segment — Edit / Remove / Force
 * check / who gets notified. Previously this lived as an inline
 * expand-in-place panel under the ticket card; pulled out into its own
 * modal so "Manage" opens a dialog instead of pushing the card's layout
 * around, matching the rest of the app's modal pattern (ConfirmDialog,
 * DelayModal, etc.).
 */
export default function ManageSegmentModal({
  open,
  onClose,
  onEdit,
  onRemove,
  removing,
  onForceCheck,
  checking,
  showForceCheck,
  notifiesLabel,
}: {
  open: boolean
  onClose: () => void
  onEdit: () => void
  onRemove: () => void
  removing: boolean
  onForceCheck: () => void
  checking: boolean
  showForceCheck: boolean
  notifiesLabel: string
}) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  if (typeof document === 'undefined') return null

  function onOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onOverlayClick}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="glass-card p-6 w-full"
        style={{ maxWidth: '22rem', background: 'rgba(20,20,20,0.97)', position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{ position: 'absolute', top: '14px', right: '14px', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
        >
          <X size={15} />
        </button>

        <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)', marginBottom: '16px' }}>Manage segment</h2>

        <div className={styles.manageActions} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '14px' }}>
          <button onClick={() => { onClose(); onEdit() }} className={styles.linkBtn}>
            Edit
          </button>
          {showForceCheck && (
            <button onClick={onForceCheck} disabled={checking} className={styles.linkBtn}>
              {checking ? 'Checking…' : 'Force check now'}
            </button>
          )}
          <button onClick={onRemove} disabled={removing} className={styles.linkBtn} style={{ color: 'var(--danger)' }}>
            {removing ? 'Removing…' : 'Remove segment'}
          </button>
        </div>

        <div className={styles.notifiesNote} style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1.5px solid var(--border-soft)' }}>
          {notifiesLabel}
        </div>
      </div>
    </div>,
    document.body
  )
}

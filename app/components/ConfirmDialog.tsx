'use client'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * Generic confirm/cancel modal — replaces the native `confirm()` popups
 * previously used for destructive actions (delete trip, remove segment).
 * Standalone so any page/component can reuse it rather than each one
 * rolling its own overlay markup.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    confirmRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { e.stopPropagation(); onCancel() }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(e) => e.stopPropagation()}
        className="glass-card p-6 w-full"
        style={{ maxWidth: '26rem', background: 'rgba(20,20,20,0.97)' }}
      >
        <h2 id="confirm-dialog-title" className="text-editorial text-white font-semibold mb-2" style={{ fontSize: '1.05rem' }}>
          {title}
        </h2>
        <p id="confirm-dialog-message" className="text-editorial text-white/60 mb-6" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-full text-label border border-white/15 disabled:opacity-50"
            style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem' }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-full text-label disabled:opacity-50"
            style={
              danger
                ? { background: 'rgba(229,72,77,0.15)', color: '#e5484d', border: '1px solid rgba(229,72,77,0.3)' }
                : { background: 'var(--warm-white)', color: 'var(--charcoal)' }
            }
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

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
      style={{ background: 'var(--overlay-scrim)' }}
      onClick={(e) => { e.stopPropagation(); onCancel() }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(e) => e.stopPropagation()}
        className="glass-card p-6 w-full"
        style={{
          maxWidth: '26rem',
          background: 'var(--card)',
          border: '1.5px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-pop)',
        }}
      >
        <h2 id="confirm-dialog-title" className="text-editorial font-semibold mb-2" style={{ fontSize: '1.05rem', color: 'var(--ink)' }}>
          {title}
        </h2>
        <p id="confirm-dialog-message" className="text-editorial mb-6" style={{ fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--muted)' }}>
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-label disabled:opacity-50"
            style={{ border: '1.5px solid var(--border)', borderRadius: 'var(--radius-pill)', color: 'var(--muted)', fontSize: '0.7rem' }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-label disabled:opacity-50"
            style={
              danger
                ? { background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-pill)', fontSize: '0.7rem' }
                : { background: 'var(--accent)', color: '#0a0b0e', borderRadius: 'var(--radius-pill)', fontSize: '0.7rem' }
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

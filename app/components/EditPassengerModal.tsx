'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { X, Trash2 } from 'lucide-react'
import styles from '../styles/passengersModal.module.css'
import type { PassengerDTO } from './types'

interface Props {
  tripId: string
  passenger: PassengerDTO | null
  open: boolean
  onClose: () => void
  isFirstPassenger: boolean
}

// Splits the stored "phoneCountry phoneArea phoneNumber" string (the same
// format handleSave joins on save) back into its three parts for editing.
// Falls back to putting the whole thing in the last field if it doesn't
// look like the expected shape, rather than silently dropping data.
function parsePhone(phone: string | null): { country: string; area: string; number: string } {
  if (!phone) return { country: '', area: '', number: '' }
  const parts = phone.trim().split(/\s+/)
  if (parts.length >= 3 && /^\+?\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    return { country: parts[0], area: parts[1], number: parts.slice(2).join(' ') }
  }
  return { country: '', area: '', number: phone }
}

export default function EditPassengerModal({ tripId, passenger, open, onClose, isFirstPassenger }: Props) {
  const router = useRouter()
  const overlayRef = useRef<HTMLDivElement>(null)
  const isEditing = !!passenger

  const [form, setForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    phoneCountry: '',
    phoneArea: '',
    phoneNumber: '',
    isPrimary: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      if (passenger) {
        const parts = passenger.name.split(' ')
        const first = parts[0] || ''
        const last = parts.length > 1 ? parts[parts.length - 1] : ''
        const middle = parts.length > 2 ? parts.slice(1, parts.length - 1).join(' ') : ''
        const phoneParts = parsePhone(passenger.phone)

        setForm({
          firstName: first,
          middleName: middle,
          lastName: last,
          email: passenger.email || '',
          phoneCountry: phoneParts.country,
          phoneArea: phoneParts.area,
          phoneNumber: phoneParts.number,
          isPrimary: passenger.isPrimary || false,
        })
      } else {
        setForm({
          firstName: '',
          middleName: '',
          lastName: '',
          email: '',
          phoneCountry: '',
          phoneArea: '',
          phoneNumber: '',
          isPrimary: isFirstPassenger,
        })
      }
      setError(null)
    }
  }, [open, passenger, isFirstPassenger])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  function onOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  async function handleSave() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setError('First name, last name, and email are required')
      return
    }

    setLoading(true)
    setError(null)

    const name = [form.firstName.trim(), form.middleName.trim(), form.lastName.trim()].filter(Boolean).join(' ')
    const phone = [form.phoneCountry.trim(), form.phoneArea.trim(), form.phoneNumber.trim()].filter(Boolean).join(' ') || undefined

    try {
      if (isEditing) {
        const res = await fetch(`/api/trips/${tripId}/passengers/${passenger.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name, 
            email: form.email.trim(), 
            phone,
            isPrimary: form.isPrimary 
          }),
        })
        if (!res.ok) throw new Error('Failed to update passenger')
      } else {
        const res = await fetch(`/api/trips/${tripId}/passengers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name, 
            email: form.email.trim(), 
            phone,
            isPrimary: form.isPrimary 
          }),
        })
        if (!res.ok) throw new Error('Failed to add passenger')
      }
      onClose()
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!passenger) return
    if (!confirm('Remove this passenger from the trip?')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/passengers/${passenger.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete passenger')
      onClose()
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className={styles.overlay} ref={overlayRef} onClick={onOverlayClick} aria-modal="true" role="dialog">
      <div className={styles.modal} style={{ maxWidth: '600px' }}>
        <button type="button" className={styles.closeBtn} aria-label="Close" onClick={onClose}>
          <X size={15} />
        </button>

        <div className={styles.pad}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 className={styles.title} style={{ margin: 0 }}>
              {isEditing ? 'Edit Passenger' : 'Add Passenger'}
            </h2>
            {isEditing && (
              <button 
                type="button" 
                onClick={handleDelete}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '5px', 
                  border: '1.5px solid transparent', background: 'rgba(224, 82, 82, 0.1)', 
                  color: 'var(--danger, #e05252)', borderRadius: 'var(--radius-pill)', 
                  padding: '6px 14px', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer' 
                }}
              >
                <Trash2 size={13} /> Delete Passenger
              </button>
            )}
          </div>
          <hr className={styles.hr} />

          {error && <div className={styles.field} style={{ color: 'var(--danger, #e05252)', fontSize: '12px' }}>{error}</div>}

          <div style={{ fontSize: '10.5px', color: 'var(--muted)', marginBottom: '20px' }}>
            * Please fill out the required fields.
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--ink)', marginBottom: '16px' }}>
            <input 
              type="checkbox" 
              checked={form.isPrimary}
              onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })}
              disabled={isFirstPassenger}
            /> 
            Make this the trip's primary passenger
          </label>

          <div style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '20px 0 12px' }}>
            Full Name
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '16px' }}>
            <div className={styles.field} style={{ marginBottom: 0 }}>
              <label className={styles.fieldLabel}>First Name <span style={{ color: 'var(--amber)' }}>*</span></label>
              <input
                type="text"
                className={styles.textInput}
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </div>
            <div className={styles.field} style={{ marginBottom: 0 }}>
              <label className={styles.fieldLabel}>Middle Name</label>
              <input
                type="text"
                className={styles.textInput}
                value={form.middleName}
                onChange={(e) => setForm({ ...form, middleName: e.target.value })}
              />
            </div>
            <div className={styles.field} style={{ marginBottom: 0 }}>
              <label className={styles.fieldLabel}>Last Name <span style={{ color: 'var(--amber)' }}>*</span></label>
              <input
                type="text"
                className={styles.textInput}
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </div>
          </div>

          <div style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '20px 0 12px' }}>
            Contact Information
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className={styles.field} style={{ marginBottom: 0 }}>
              <label className={styles.fieldLabel}>Email <span style={{ color: 'var(--amber)' }}>*</span></label>
              <input
                type="email"
                className={styles.textInput}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className={styles.field} style={{ marginBottom: 0 }}>
              <label className={styles.fieldLabel}>Phone #</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className={styles.textInput}
                  style={{ width: '56px', flex: 'none', padding: '9px 8px', textAlign: 'center' }}
                  placeholder="+1"
                  value={form.phoneCountry}
                  onChange={(e) => setForm({ ...form, phoneCountry: e.target.value })}
                />
                <input
                  type="text"
                  className={styles.textInput}
                  style={{ width: '56px', flex: 'none', padding: '9px 8px', textAlign: 'center' }}
                  placeholder="876"
                  value={form.phoneArea}
                  onChange={(e) => setForm({ ...form, phoneArea: e.target.value })}
                />
                <input
                  type="text"
                  className={styles.textInput}
                  placeholder="765 - 4321"
                  value={form.phoneNumber}
                  onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className={styles.footer} style={{ justifyContent: 'flex-end', marginTop: '32px' }}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={loading || !form.firstName.trim() || !form.lastName.trim() || !form.email.trim()}
              onClick={handleSave}
            >
              {loading ? (isEditing ? 'Updating…' : 'Adding…') : isEditing ? 'Update Passenger' : '+ Add To Trip'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

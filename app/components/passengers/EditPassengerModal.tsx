'use client'
import { useState } from 'react'
import type { PassengerDTO } from '../types'

const fieldClass =
  'glass-card px-3.5 py-2.5 text-editorial text-white bg-transparent outline-none w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40'

interface Props {
  tripId: string
  /** null = create mode, otherwise editing this passenger. */
  passenger: PassengerDTO | null
  onClose: () => void
  onSaved: () => void
}

export default function EditPassengerModal({ tripId, passenger, onClose, onSaved }: Props) {
  const [name, setName] = useState(passenger?.name ?? '')
  const [isPrimary, setIsPrimary] = useState(passenger?.isPrimary ?? false)
  const [email, setEmail] = useState(passenger?.email ?? '')
  const [phone, setPhone] = useState(passenger?.phone ?? '')
  const [emergencyContact, setEmergencyContact] = useState(passenger?.emergencyContact ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim()) {
      setError('Name is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const body = { name: name.trim(), isPrimary, email, phone, emergencyContact }
      const url = passenger
        ? `/api/trips/${tripId}/passengers/${passenger.id}`
        : `/api/trips/${tripId}/passengers`
      const res = await fetch(url, {
        method: passenger ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Something went wrong — try again?')
        setSaving(false)
        return
      }
      onSaved()
    } catch {
      setError('Maestravl is having trouble connecting right now.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="glass-card p-6 flex flex-col gap-4" style={{ width: '24rem', maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-editorial text-white/90" style={{ fontSize: '1rem' }}>
          {passenger ? 'Edit passenger' : 'Add passenger'}
        </h2>

        <label className="flex flex-col gap-1">
          <span className="text-label text-white/40" style={{ fontSize: '0.65rem' }}>
            Name
          </span>
          <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
          <span className="text-label text-white/60" style={{ fontSize: '0.75rem' }}>
            Primary passenger
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-label text-white/40" style={{ fontSize: '0.65rem' }}>
            Email
          </span>
          <input className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-label text-white/40" style={{ fontSize: '0.65rem' }}>
            Phone
          </span>
          <input className={fieldClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 555 5555" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-label text-white/40" style={{ fontSize: '0.65rem' }}>
            Emergency contact
          </span>
          <input
            className={fieldClass}
            value={emergencyContact}
            onChange={(e) => setEmergencyContact(e.target.value)}
            placeholder="Optional"
          />
        </label>

        {error && (
          <p className="text-label" style={{ fontSize: '0.7rem', color: '#e5484d' }}>
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end mt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-5 py-2 rounded-full text-editorial text-white/60 border border-white/15"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-full text-editorial font-medium disabled:opacity-50"
            style={{ background: 'var(--warm-white)', color: 'var(--charcoal)' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

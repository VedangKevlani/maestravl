'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TripDTO } from './types'
import TripCardMenu from './TripCardMenu'

export default function TripHeader({ trip }: { trip: TripDTO }) {
  const router = useRouter()
  const [addingPassenger, setAddingPassenger] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingPassengerId, setEditingPassengerId] = useState<string | null>(null)
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [savingContact, setSavingContact] = useState(false)

  async function addPassenger(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    await fetch(`/api/trips/${trip.id}/passengers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim(), isPrimary: trip.passengers.length === 0 }),
    })
    setSubmitting(false)
    setName('')
    setEmail('')
    setPhone('')
    setAddingPassenger(false)
    router.refresh()
  }

  function startEditingContact(passengerId: string, currentEmail: string | null, currentPhone: string | null) {
    setEditingPassengerId(passengerId)
    setEditEmail(currentEmail ?? '')
    setEditPhone(currentPhone ?? '')
  }

  async function saveContact(e: React.FormEvent, passengerId: string) {
    e.preventDefault()
    setSavingContact(true)
    await fetch(`/api/trips/${trip.id}/passengers/${passengerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: editEmail.trim(), phone: editPhone.trim() }),
    })
    setSavingContact(false)
    setEditingPassengerId(null)
    router.refresh()
  }

  return (
    <div data-tour="trip-header">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-label text-white/40 mb-2">trip</p>
          <h1 className="text-display text-white" style={{ fontSize: 'clamp(1.6rem, 4vw, 2.4rem)' }}>{trip.title}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-label px-3 py-1.5 rounded-full whitespace-nowrap" style={{ background: 'rgba(82,183,136,0.12)', color: '#52b788' }}>
            {trip.status}
          </span>
          <a
            href={`/api/trips/${trip.id}/activity/pdf`}
            className="text-label text-white/40 hover:text-white/80 whitespace-nowrap"
            style={{ fontSize: '0.65rem' }}
            title="Download this trip's full recovery history as a PDF, for a support conversation"
          >
            Activity log (PDF)
          </a>
          <TripCardMenu tripId={trip.id} tripTitle={trip.title} redirectTo="/dashboard" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-5" data-tour="add-passenger">
        {trip.passengers.map((p) =>
          editingPassengerId === p.id ? (
            <form key={p.id} onSubmit={(e) => saveContact(e, p.id)} className="flex items-center gap-2 flex-wrap">
              <input
                autoFocus
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="Email (for notifications)"
                className="glass-card px-3 py-1.5 text-editorial text-white bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
                style={{ fontSize: '0.82rem' }}
              />
              <input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="Phone (for text/WhatsApp)"
                className="glass-card px-3 py-1.5 text-editorial text-white bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
                style={{ fontSize: '0.82rem' }}
              />
              <button type="submit" disabled={savingContact} className="text-label text-white/60 hover:text-white" style={{ fontSize: '0.65rem' }}>
                {savingContact ? '…' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditingPassengerId(null)} className="text-label text-white/30 hover:text-white/60" style={{ fontSize: '0.65rem' }}>
                Cancel
              </button>
            </form>
          ) : (
            <span key={p.id} data-tour="passenger-chip" className="text-editorial px-3 py-1.5 rounded-full glass-card flex items-center gap-1.5" style={{ fontSize: '0.82rem' }}>
              <span title={[p.email, p.phone].filter(Boolean).join(' · ') || 'No email or phone on file — cannot be notified'}>
                {p.name}{p.isPrimary ? ' (primary)' : ''}{!p.email && !p.phone && <span className="text-white/30"> · no contact info</span>}
              </span>
              <button
                onClick={() => startEditingContact(p.id, p.email, p.phone)}
                className="text-white/25 hover:text-white/70"
                style={{ fontSize: '0.7rem' }}
                aria-label={p.email || p.phone ? `Edit ${p.name}'s contact info` : `Add contact info for ${p.name}`}
                title={p.email || p.phone ? 'Edit email/phone' : 'Add email/phone'}
              >
                ✎
              </button>
            </span>
          )
        )}
        {addingPassenger ? (
          <form onSubmit={addPassenger} className="flex items-center gap-2 flex-wrap">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Passenger name"
              className="glass-card px-3 py-1.5 text-editorial text-white bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
              style={{ fontSize: '0.82rem' }}
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (for notifications)"
              className="glass-card px-3 py-1.5 text-editorial text-white bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
              style={{ fontSize: '0.82rem' }}
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone (for text/WhatsApp)"
              className="glass-card px-3 py-1.5 text-editorial text-white bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
              style={{ fontSize: '0.82rem' }}
            />
            <button type="submit" disabled={submitting} className="text-label text-white/60 hover:text-white" style={{ fontSize: '0.65rem' }}>
              {submitting ? '…' : 'Add'}
            </button>
            <button type="button" onClick={() => { setAddingPassenger(false); setName(''); setEmail(''); setPhone('') }} className="text-label text-white/30 hover:text-white/60" style={{ fontSize: '0.65rem' }}>
              Cancel
            </button>
          </form>
        ) : (
          <button
            onClick={() => setAddingPassenger(true)}
            className="text-editorial px-3 py-1.5 rounded-full border border-dashed border-white/20 text-white/40 hover:text-white/70 hover:border-white/40"
            style={{ fontSize: '0.82rem' }}
          >
            + Add passenger
          </button>
        )}
      </div>
    </div>
  )
}

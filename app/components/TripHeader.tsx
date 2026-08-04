'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TripDTO } from './types'
import TripCardMenu from './TripCardMenu'

export default function TripHeader({ trip }: { trip: TripDTO }) {
  const router = useRouter()
  const [addingPassenger, setAddingPassenger] = useState(false)
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function addPassenger(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    await fetch(`/api/trips/${trip.id}/passengers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), isPrimary: trip.passengers.length === 0 }),
    })
    setSubmitting(false)
    setName('')
    setAddingPassenger(false)
    router.refresh()
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-label text-white/40 mb-2">trip</p>
          <h1 className="text-display text-white" style={{ fontSize: 'clamp(1.6rem, 4vw, 2.4rem)' }}>{trip.title}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-label px-3 py-1.5 rounded-full whitespace-nowrap" style={{ background: 'rgba(82,183,136,0.12)', color: '#52b788' }}>
            {trip.status}
          </span>
          <TripCardMenu tripId={trip.id} tripTitle={trip.title} redirectTo="/dashboard" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-5">
        {trip.passengers.map((p) => (
          <span key={p.id} className="text-editorial px-3 py-1.5 rounded-full glass-card" style={{ fontSize: '0.82rem' }}>
            {p.name}{p.isPrimary ? ' (primary)' : ''}
          </span>
        ))}
        {addingPassenger ? (
          <form onSubmit={addPassenger} className="flex items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => { if (!name.trim()) setAddingPassenger(false) }}
              placeholder="Passenger name"
              className="glass-card px-3 py-1.5 text-editorial text-white bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
              style={{ fontSize: '0.82rem' }}
            />
            <button type="submit" disabled={submitting} className="text-label text-white/60 hover:text-white" style={{ fontSize: '0.65rem' }}>
              {submitting ? '…' : 'Add'}
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

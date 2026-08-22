'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PassengerDTO } from '../types'
import EditPassengerModal from './EditPassengerModal'

interface Props {
  tripId: string
  passengers: PassengerDTO[]
  onClose: () => void
}

export default function ManagePassengersModal({ tripId, passengers, onClose }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState<PassengerDTO | null | 'new'>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    setEditing(null)
    router.refresh()
  }

  async function handleDelete(passenger: PassengerDTO) {
    if (passengers.length <= 1) return // guarded server-side too, but no point offering it
    setDeletingId(passenger.id)
    setError(null)
    try {
      const res = await fetch(`/api/trips/${tripId}/passengers/${passenger.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not remove that passenger.')
        setDeletingId(null)
        return
      }
      router.refresh()
    } catch {
      setError('Maestravl is having trouble connecting right now.')
      setDeletingId(null)
    }
  }

  if (editing) {
    return (
      <EditPassengerModal
        tripId={tripId}
        passenger={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="glass-card p-6 flex flex-col gap-4" style={{ width: '26rem', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-editorial text-white/90" style={{ fontSize: '1rem' }}>
            Passengers
          </h2>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white/70" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {passengers.map((p) => (
            <div key={p.id} className="glass-card p-3 flex items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-editorial text-white/90" style={{ fontSize: '0.85rem' }}>
                  {p.name}
                  {p.isPrimary && (
                    <span className="text-label" style={{ fontSize: '0.6rem', color: 'var(--faint, rgba(255,255,255,0.4))', marginLeft: '0.5rem' }}>
                      PRIMARY
                    </span>
                  )}
                </span>
                {(p.email || p.phone) && (
                  <span className="text-label text-white/40" style={{ fontSize: '0.7rem' }}>
                    {[p.email, p.phone].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditing(p)}
                  className="text-label text-white/60 hover:text-white/90"
                  style={{ fontSize: '0.7rem' }}
                >
                  Edit
                </button>
                {passengers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    disabled={deletingId === p.id}
                    className="text-label hover:text-white/90"
                    style={{ fontSize: '0.7rem', color: '#e5484d' }}
                  >
                    {deletingId === p.id ? 'Removing…' : 'Remove'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <p className="text-label" style={{ fontSize: '0.7rem', color: '#e5484d' }}>
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => setEditing('new')}
          className="px-5 py-2 rounded-full text-editorial font-medium"
          style={{ background: 'var(--warm-white)', color: 'var(--charcoal)' }}
        >
          + Add passenger
        </button>
      </div>
    </div>
  )
}

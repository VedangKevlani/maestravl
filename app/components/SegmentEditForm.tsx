'use client'
import { useState } from 'react'
import type { PassengerDTO, SegmentDTO } from './types'

const fieldClass = 'glass-card px-3.5 py-2.5 text-editorial text-white bg-transparent outline-none w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40'
const labelClass = 'text-label text-white/40'

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function SegmentEditForm({ segment, passengers, onDone, onCancel }: { segment: SegmentDTO; passengers: PassengerDTO[]; onDone: () => void; onCancel: () => void }) {
  const [passengerIds, setPassengerIds] = useState<string[]>(segment.passengerIds)
  const [form, setForm] = useState({
    provider: segment.provider ?? '',
    identifier: segment.identifier ?? '',
    departureLocation: segment.departureLocation ?? '',
    departureLocationCode: segment.departureLocationCode ?? '',
    arrivalLocation: segment.arrivalLocation ?? '',
    arrivalLocationCode: segment.arrivalLocationCode ?? '',
    departureTime: toLocalInput(segment.departureTime),
    arrivalTime: toLocalInput(segment.arrivalTime),
    departureTerminal: segment.departureTerminal ?? '',
    departureGate: segment.departureGate ?? '',
    seat: segment.seat ?? '',
    cabin: segment.cabin ?? '',
    confirmationNumber: segment.confirmationNumber ?? '',
    currency: segment.currency ?? '',
    price: segment.price != null ? String(segment.price) : '',
    notes: segment.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(name: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [name]: value }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload: Record<string, unknown> = { passengerIds }
    for (const [k, v] of Object.entries(form)) {
      if (k === 'departureTime' || k === 'arrivalTime') payload[k] = v ? new Date(v).toISOString() : null
      else if (k === 'price') payload[k] = v ? parseFloat(v) : null
      else payload[k] = v || null
    }

    const res = await fetch(`/api/segments/${segment.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Could not save changes')
      return
    }
    onDone()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Provider</span>
          <input className={fieldClass} value={form.provider} onChange={(e) => set('provider', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Identifier</span>
          <input className={fieldClass} value={form.identifier} onChange={(e) => set('identifier', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Departure location</span>
          <input className={fieldClass} value={form.departureLocation} onChange={(e) => set('departureLocation', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Arrival location</span>
          <input className={fieldClass} value={form.arrivalLocation} onChange={(e) => set('arrivalLocation', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Departure code</span>
          <input className={fieldClass} value={form.departureLocationCode} onChange={(e) => set('departureLocationCode', e.target.value.toUpperCase())} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Arrival code</span>
          <input className={fieldClass} value={form.arrivalLocationCode} onChange={(e) => set('arrivalLocationCode', e.target.value.toUpperCase())} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Departure time</span>
          <input type="datetime-local" className={fieldClass} value={form.departureTime} onChange={(e) => set('departureTime', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Arrival time</span>
          <input type="datetime-local" className={fieldClass} value={form.arrivalTime} onChange={(e) => set('arrivalTime', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Terminal</span>
          <input className={fieldClass} value={form.departureTerminal} onChange={(e) => set('departureTerminal', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Gate</span>
          <input className={fieldClass} value={form.departureGate} onChange={(e) => set('departureGate', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Seat</span>
          <input className={fieldClass} value={form.seat} onChange={(e) => set('seat', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Cabin</span>
          <input className={fieldClass} value={form.cabin} onChange={(e) => set('cabin', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Confirmation number</span>
          <input className={fieldClass} value={form.confirmationNumber} onChange={(e) => set('confirmationNumber', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Price</span>
          <div className="flex gap-2">
            <input className={fieldClass} style={{ width: 70 }} value={form.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} />
            <input type="number" step="0.01" className={fieldClass} value={form.price} onChange={(e) => set('price', e.target.value)} />
          </div>
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Notes</span>
        <textarea className={fieldClass} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Notify on status change</span>
        {passengers.length === 0 ? (
          <p className="text-editorial text-white/40" style={{ fontSize: '0.82rem' }}>No passengers on this trip yet — add one above first.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {passengers.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 text-editorial text-white/70" style={{ fontSize: '0.82rem' }}>
                <input
                  type="checkbox"
                  checked={passengerIds.includes(p.id)}
                  onChange={(e) =>
                    setPassengerIds((ids) => (e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id)))
                  }
                />
                {p.name}{!p.email && <span className="text-white/30"> (no email on file)</span>}
              </label>
            ))}
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-editorial text-red-400" style={{ fontSize: '0.85rem' }}>{error}</p>}

      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="px-5 py-2 rounded-full text-editorial font-medium disabled:opacity-50" style={{ background: 'var(--warm-white)', color: 'var(--charcoal)' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2 rounded-full text-editorial text-white/60 border border-white/15">
          Cancel
        </button>
      </div>
    </form>
  )
}

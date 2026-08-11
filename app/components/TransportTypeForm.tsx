'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getFieldProfile } from './segmentFieldProfiles'

const TRANSPORT_OPTIONS: { value: string; label: string; icon: string }[] = [
  { value: 'FLIGHT', label: 'Flight', icon: '✈' },
  { value: 'TRAIN', label: 'Train', icon: '🚆' },
  { value: 'BUS', label: 'Bus', icon: '🚌' },
  { value: 'TAXI', label: 'Taxi', icon: '🚖' },
  { value: 'FERRY', label: 'Ferry', icon: '⛴' },
  { value: 'CRUISE', label: 'Cruise', icon: '🚢' },
  { value: 'BOAT', label: 'Boat', icon: '🚤' },
  { value: 'HELICOPTER', label: 'Helicopter', icon: '🚁' },
  { value: 'BICYCLE', label: 'Bicycle Rental', icon: '🚲' },
  { value: 'RENTAL_CAR', label: 'Rental Car', icon: '🚗' },
  { value: 'WALKING', label: 'Walking', icon: '🚶' },
  { value: 'HOTEL', label: 'Hotel', icon: '🏨' },
  { value: 'RESTAURANT', label: 'Restaurant', icon: '🍽' },
  { value: 'EXCURSION', label: 'Excursion', icon: '🗺' },
  { value: 'OTHER', label: 'Other', icon: '•' },
]

const PROVIDER_PLACEHOLDERS: Record<string, string> = {
  FLIGHT: 'e.g. American Airlines',
  TRAIN: 'e.g. Amtrak',
  BUS: 'e.g. Greyhound',
  TAXI: 'e.g. Uber, local taxi co.',
  FERRY: 'e.g. Star Ferry',
  CRUISE: 'e.g. Royal Caribbean',
  BOAT: 'e.g. charter company',
  HELICOPTER: 'e.g. Blade',
  BICYCLE: 'e.g. Lime, Citi Bike',
  RENTAL_CAR: 'e.g. Hertz',
  WALKING: 'e.g. guided tour company',
  HOTEL: 'e.g. Marriott, Airbnb host',
  RESTAURANT: 'e.g. restaurant name',
  EXCURSION: 'e.g. tour operator',
  OTHER: 'e.g. company / operator name',
}

const IDENTIFIER_PLACEHOLDERS: Record<string, string> = {
  FLIGHT: 'e.g. AA123',
  TRAIN: 'e.g. train / route number',
  BUS: 'e.g. route / bus number',
  TAXI: 'e.g. confirmation code',
  FERRY: 'e.g. crossing number',
  CRUISE: 'e.g. ship name / sailing number',
  BOAT: 'e.g. booking reference',
  HELICOPTER: 'e.g. flight number',
  BICYCLE: 'e.g. bike / dock number',
  RENTAL_CAR: 'e.g. reservation number',
  WALKING: 'e.g. route name',
  HOTEL: 'e.g. confirmation number',
  RESTAURANT: 'e.g. reservation number',
  EXCURSION: 'e.g. booking reference',
  OTHER: 'e.g. reference number',
}

const fieldClass = 'glass-card px-3.5 py-2.5 text-editorial text-white bg-transparent outline-none w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40'
const labelClass = 'text-label text-white/40'

interface Props {
  tripId: string
  onCreated?: () => void
}

export default function TransportTypeForm({ tripId, onCreated }: Props) {
  const router = useRouter()
  const [transportType, setTransportType] = useState('FLIGHT')
  const [form, setForm] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const profile = getFieldProfile(transportType)

  function set(name: string, value: string) {
    setForm((f) => ({ ...f, [name]: value }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const payload: Record<string, unknown> = { transportType }
    for (const [k, v] of Object.entries(form)) {
      if (!v) continue
      if (k === 'departureTime' || k === 'arrivalTime') payload[k] = new Date(v).toISOString()
      else if (k === 'price') payload[k] = parseFloat(v)
      else payload[k] = v
    }

    const res = await fetch(`/api/trips/${tripId}/segments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSubmitting(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Could not add this segment')
      return
    }

    setForm({})
    if (onCreated) onCreated()
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="glass-card p-6 flex flex-col gap-4">
      <div>
        <p className={`${labelClass} mb-2`}>Transport type</p>
        <div className="flex flex-wrap gap-2">
          {TRANSPORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTransportType(opt.value)}
              className="px-3 py-1.5 rounded-full text-editorial flex items-center gap-1.5"
              style={{
                fontSize: '0.8rem',
                background: transportType === opt.value ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.04)',
                border: transportType === opt.value ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
                color: transportType === opt.value ? 'white' : 'rgba(255,255,255,0.6)',
              }}
            >
              <span aria-hidden="true">{opt.icon}</span> {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Provider / operator</span>
          <input className={fieldClass} value={form.provider ?? ''} onChange={(e) => set('provider', e.target.value)} placeholder={PROVIDER_PLACEHOLDERS[transportType]} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Identifier / number</span>
          <input className={fieldClass} value={form.identifier ?? ''} onChange={(e) => set('identifier', e.target.value)} placeholder={IDENTIFIER_PLACEHOLDERS[transportType]} />
        </label>

        {profile.hasRoute ? (
          <>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>{profile.departureLocationLabel}</span>
              <input className={fieldClass} value={form.departureLocation ?? ''} onChange={(e) => set('departureLocation', e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>{profile.arrivalLocationLabel}</span>
              <input className={fieldClass} value={form.arrivalLocation ?? ''} onChange={(e) => set('arrivalLocation', e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>{profile.departureCodeLabel}</span>
              <input className={fieldClass} value={form.departureLocationCode ?? ''} onChange={(e) => set('departureLocationCode', e.target.value.toUpperCase())} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>{profile.arrivalCodeLabel}</span>
              <input className={fieldClass} value={form.arrivalLocationCode ?? ''} onChange={(e) => set('arrivalLocationCode', e.target.value.toUpperCase())} />
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass}>{profile.singleLocationLabel}</span>
            <input className={fieldClass} value={form.departureLocation ?? ''} onChange={(e) => set('departureLocation', e.target.value)} />
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>{profile.departureTimeLabel}</span>
          <input type="datetime-local" className={fieldClass} value={form.departureTime ?? ''} onChange={(e) => set('departureTime', e.target.value)} />
        </label>
        {profile.arrivalTimeLabel && (
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>{profile.arrivalTimeLabel}</span>
            <input type="datetime-local" className={fieldClass} value={form.arrivalTime ?? ''} onChange={(e) => set('arrivalTime', e.target.value)} />
          </label>
        )}
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelClass}>Timezone (where this actually happens — matters for messages sent on your behalf)</span>
          <div className="flex gap-2">
            <input
              className={fieldClass}
              value={form.timezone ?? ''}
              onChange={(e) => set('timezone', e.target.value)}
              placeholder="e.g. America/Jamaica, America/Los_Angeles"
            />
            <button
              type="button"
              onClick={() => set('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone)}
              className="text-label text-white/40 hover:text-white/80 whitespace-nowrap shrink-0"
              style={{ fontSize: '0.7rem' }}
            >
              Use mine
            </button>
          </div>
        </label>

        {profile.hasRoute && profile.hasTerminalGate && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Terminal</span>
              <input className={fieldClass} value={form.departureTerminal ?? ''} onChange={(e) => set('departureTerminal', e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Gate</span>
              <input className={fieldClass} value={form.departureGate ?? ''} onChange={(e) => set('departureGate', e.target.value)} />
            </label>
          </>
        )}

        {profile.hasRoute && profile.hasSeatCabin && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Seat</span>
              <input className={fieldClass} value={form.seat ?? ''} onChange={(e) => set('seat', e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Cabin / class</span>
              <input className={fieldClass} value={form.cabin ?? ''} onChange={(e) => set('cabin', e.target.value)} />
            </label>
          </>
        )}

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Confirmation number</span>
          <input className={fieldClass} value={form.confirmationNumber ?? ''} onChange={(e) => set('confirmationNumber', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Price</span>
          <div className="flex gap-2">
            <input className={fieldClass} style={{ width: 70 }} value={form.currency ?? ''} onChange={(e) => set('currency', e.target.value.toUpperCase())} placeholder="USD" />
            <input type="number" step="0.01" className={fieldClass} value={form.price ?? ''} onChange={(e) => set('price', e.target.value)} />
          </div>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Notes</span>
        <textarea className={fieldClass} rows={2} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
      </label>

      {error && <p role="alert" className="text-editorial text-red-400" style={{ fontSize: '0.85rem' }}>{error}</p>}

      <button
        type="submit" disabled={submitting}
        className="self-start px-6 py-2.5 rounded-full text-editorial font-medium disabled:opacity-50"
        style={{ background: 'var(--warm-white)', color: 'var(--charcoal)' }}
      >
        {submitting ? 'Adding…' : 'Add to timeline'}
      </button>
    </form>
  )
}

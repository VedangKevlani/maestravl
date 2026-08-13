'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import UploadDropzone from '../../../components/UploadDropzone'

export default function NewTripPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function createManualTrip(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    const res = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || 'New Trip' }),
    })
    const data = await res.json()
    setCreating(false)
    if (!res.ok) {
      setError(data.error || 'Could not create trip')
      return
    }
    router.push(`/trips/${data.trip.id}`)
  }

  return (
    <div className="max-w-2xl">
      <p className="text-label text-white/40 mb-2">new trip</p>
      <h1 className="text-display text-white mb-10" style={{ fontSize: 'clamp(1.6rem, 4vw, 2.2rem)' }}>How do you want to start?</h1>

      <div data-tour="trip-start-options">
        <div className="mb-6">
          <p className="text-editorial text-white/70 mb-3" style={{ fontSize: '0.95rem' }}>Import an itinerary</p>
          <UploadDropzone />
        </div>

        <div className="flex items-center gap-4 my-8">
          <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.1)' }} />
          <span className="text-label text-white/30">or</span>
          <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.1)' }} />
        </div>

        <div>
          <p className="text-editorial text-white/70 mb-3" style={{ fontSize: '0.95rem' }}>Build a trip manually</p>
          <form onSubmit={createManualTrip} className="flex gap-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Trip name, e.g. Kingston → Punta Cana"
              className="glass-card px-4 py-3 text-editorial text-white bg-transparent outline-none flex-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
            />
            <button
              type="submit" disabled={creating}
              className="px-6 py-3 rounded-full text-editorial font-medium whitespace-nowrap disabled:opacity-50"
              style={{ background: 'var(--warm-white)', color: 'var(--charcoal)' }}
            >
              {creating ? 'Creating…' : 'Start trip'}
            </button>
          </form>
          {error && <p role="alert" className="text-editorial text-red-400 mt-3" style={{ fontSize: '0.85rem' }}>{error}</p>}
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import UploadDropzone from '../../../components/UploadDropzone'
import styles from '../../../styles/newTrip.module.css'

export default function NewTripPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function createManualTrip(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Please enter a trip name to continue.')
      return
    }
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
    <div className={styles.wrap}>
      <button type="button" className={styles.backLink} onClick={() => router.push('/dashboard')}>
        <ArrowLeft size={13} /> Dashboard
      </button>

      <p className={styles.label}>New trip</p>
      <h1 className={styles.title}>How do you want to start?</h1>
      <hr className="border-0" style={{ borderTop: '1.5px solid var(--border-soft)', margin: '-16px 0 32px' }} />

      <div data-tour="trip-start-options">
        <p className={styles.sectionLabel}>Import an itinerary</p>
        <UploadDropzone />

        <div className={styles.divider}>or</div>

        <p className={styles.sectionLabel}>Build a trip manually</p>
        <form onSubmit={createManualTrip} className={styles.manualRow} noValidate>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Trip name, e.g. Kingston → Punta Cana"
            className={styles.textInput}
          />
          <button type="submit" disabled={creating} className={styles.startBtn}>
            {creating ? 'Creating…' : 'Start trip'}
          </button>
        </form>
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </div>
    </div>
  )
}

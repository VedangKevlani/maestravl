'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  tripId?: string
  onUploaded?: () => void
}

export default function UploadDropzone({ tripId, onUploaded }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function uploadFile(file: File) {
    setUploading(true)
    setError(null)
    const form = new FormData()
    form.append('file', file)
    if (tripId) form.append('tripId', tripId)

    const res = await fetch('/api/upload', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    setUploading(false)

    if (!res.ok) {
      setError(data.error || 'Upload failed')
      if (data.tripId) router.push(`/trips/${data.tripId}`)
      return
    }

    if (onUploaded) onUploaded()
    router.push(`/trips/${data.trip.id}`)
    router.refresh()
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (file) uploadFile(file)
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
        className="glass-card flex flex-col items-center justify-center gap-3 px-6 py-16 text-center cursor-pointer transition-colors"
        style={{
          border: dragOver ? '1px dashed rgba(255,255,255,0.5)' : '1px dashed rgba(255,255,255,0.15)',
          background: dragOver ? 'rgba(255,255,255,0.06)' : undefined,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploading ? (
          <p className="text-editorial text-white/70">Reading your itinerary…</p>
        ) : (
          <>
            <p className="text-editorial text-white/80" style={{ fontSize: '1rem' }}>
              Drop a PDF, screenshot, or photo of your itinerary
            </p>
            <p className="text-label text-white/30">or click to browse · PDF, JPEG, PNG, WEBP</p>
          </>
        )}
      </div>
      {error && <p role="alert" className="text-editorial text-red-400 mt-3" style={{ fontSize: '0.85rem' }}>{error}</p>}
    </div>
  )
}

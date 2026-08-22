'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp, CloudUpload, FileText } from 'lucide-react'
import styles from '../styles/trip.module.css'
import fullStyles from '../styles/newTrip.module.css'

interface Props {
  tripId?: string
  onUploaded?: () => void
  variant?: 'full' | 'mini'
}

export default function UploadDropzone({ tripId, onUploaded, variant = 'full' }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function uploadFile(file: File) {
    setFileName(file.name)
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
      setFileName(null)
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

  if (variant === 'mini') {
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
          className={`${styles.miniDropzone} ${dragOver ? styles.miniDropzoneDragover : ''}`}
          title="Maestravl will read the document and automatically fill in the segment details for you"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <FileUp size={15} />
          {uploading ? (
            <span>{fileName ? `Reading ${fileName}…` : 'Reading…'}</span>
          ) : (
            <span>Or drop a PDF, screenshot, or photo to add a segment &middot; <b>click to browse</b></span>
          )}
        </div>
        {error && <p role="alert" className="text-editorial text-red-400 mt-2" style={{ fontSize: '0.8rem' }}>{error}</p>}
      </div>
    )
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
        className={`${fullStyles.dropZone} ${dragOver ? fullStyles.dropZoneDragover : ''}`}
        title="Maestro will read your document and auto-create all your segments — flights, hotels, cars, and more"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.eml,.txt,.jpg,.jpeg,.png,.webp"
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <CloudUpload size={22} />
        <p><b>Drop a confirmation email or PDF</b><br />or click to browse — flights, hotels, cars, anything.</p>
      </div>
      {uploading && fileName && (
        <div className={fullStyles.fileChip}>
          <FileText size={13} />
          <span>{fileName} — reading…</span>
        </div>
      )}
      {error && <p role="alert" className={fullStyles.error}>{error}</p>}
    </div>
  )
}

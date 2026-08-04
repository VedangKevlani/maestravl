'use client'
import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRouter } from 'next/navigation'
import ConfidenceBadge from './ConfidenceBadge'
import SegmentEditForm from './SegmentEditForm'
import { TRANSPORT_ICONS, type SegmentDTO } from './types'

function formatDateTime(iso: string | null) {
  if (!iso) return null
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

const MONITORING_LABEL: Record<string, string> = {
  NOT_CONFIGURED: 'Monitoring not yet connected',
  ACTIVE: 'Actively monitored',
  PAUSED: 'Monitoring paused',
  ERROR: 'Monitoring error',
}

export default function SegmentCard({ segment }: { segment: SegmentDTO }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: segment.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  let confidenceScores: Record<string, number> = {}
  try {
    confidenceScores = segment.confidenceScores ? JSON.parse(segment.confidenceScores) : {}
  } catch { /* ignore */ }
  const fieldsNeedingReview = Object.entries(confidenceScores).filter(([, v]) => v < 70)

  async function handleDelete() {
    if (!confirm('Remove this segment from the trip?')) return
    setDeleting(true)
    await fetch(`/api/segments/${segment.id}`, { method: 'DELETE' })
    router.refresh()
  }

  if (editing) {
    return (
      <div ref={setNodeRef} style={style} className="glass-card p-5">
        <SegmentEditForm segment={segment} onDone={() => { setEditing(false); router.refresh() }} onCancel={() => setEditing(false)} />
      </div>
    )
  }

  return (
    <div ref={setNodeRef} style={style} className="glass-card p-5 flex gap-4">
      <button
        {...attributes} {...listeners}
        aria-label="Drag to reorder"
        className="text-white/25 hover:text-white/60 cursor-grab active:cursor-grabbing touch-none px-1 self-stretch flex items-center"
      >
        ⠿
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>{TRANSPORT_ICONS[segment.transportType] ?? '•'}</span>
            <p className="text-editorial text-white font-medium truncate">
              {segment.provider || segment.transportType} {segment.identifier ? `· ${segment.identifier}` : ''}
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button onClick={() => setEditing(true)} className="text-label text-white/40 hover:text-white/80" style={{ fontSize: '0.65rem' }}>Edit</button>
            <button onClick={handleDelete} disabled={deleting} className="text-label text-white/40 hover:text-red-400" style={{ fontSize: '0.65rem' }}>
              {deleting ? '…' : 'Remove'}
            </button>
          </div>
        </div>

        {(segment.departureLocation || segment.arrivalLocation) && (
          <p className="text-editorial text-white/60 mb-1" style={{ fontSize: '0.85rem' }}>
            {segment.departureLocation ?? '?'} {segment.departureLocationCode ? `(${segment.departureLocationCode})` : ''}
            {' → '}
            {segment.arrivalLocation ?? '?'} {segment.arrivalLocationCode ? `(${segment.arrivalLocationCode})` : ''}
          </p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-editorial text-white/40" style={{ fontSize: '0.78rem' }}>
          {segment.departureTime && <span>Departs {formatDateTime(segment.departureTime)}</span>}
          {segment.arrivalTime && <span>Arrives {formatDateTime(segment.arrivalTime)}</span>}
          {segment.seat && <span>Seat {segment.seat}</span>}
          {segment.confirmationNumber && <span>Conf. {segment.confirmationNumber}</span>}
        </div>

        {fieldsNeedingReview.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <span className="text-label text-white/30" style={{ fontSize: '0.6rem' }}>please confirm:</span>
            {fieldsNeedingReview.map(([field, score]) => (
              <span key={field} className="inline-flex items-center gap-1">
                <span className="text-label text-white/50" style={{ fontSize: '0.62rem' }}>{field}</span>
                <ConfidenceBadge confidence={score} />
              </span>
            ))}
          </div>
        )}

        <p className="text-label text-white/20 mt-3" style={{ fontSize: '0.6rem' }}>
          {segment.monitoring ? MONITORING_LABEL[segment.monitoring.status] : 'Monitoring not yet connected'}
        </p>
      </div>
    </div>
  )
}

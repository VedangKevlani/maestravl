'use client'
import { useState, useEffect, useRef } from 'react'
import { X, ChevronDown, ChevronUp, CloudUpload, Trash2, Check, Plus } from 'lucide-react'
import styles from '../styles/segmentModal.module.css'
import TransportTypeForm from './TransportTypeForm'
import EditPassengerModal from './EditPassengerModal'
import type { SegmentDTO, TripDTO } from './types'

// Tabs matching segment-modal.html's subtabs: Transportation, Date & Time,
// Provider & Additional Info — but since TransportTypeForm already handles
// all fields in one form, this modal just wraps it and shows the "manual
// entry" flow. The subtabs are shown as visual chrome from the reference
// but the form itself is a single scrollable body (matching app behavior).
//
// Doubles as the "Edit Trip Segment" dialog — pass an existing `segment`
// and this shows prefilled fields, a Save Changes button (PATCH), and
// hides the create-only Import Itinerary section. Editing used to swap
// the boarding pass card for a plain, unstyled inline form (SegmentEditForm)
// instead of reusing this modal — that's been retired in favor of this.

function formatDateLong(iso: string | null) {
  if (!iso) return null
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(iso))
}

interface Props {
  tripId: string
  passengers: TripDTO['passengers']
  segment?: SegmentDTO | null
  open: boolean
  onClose: () => void
  onCreated: () => void
  onDelete?: () => void
  deleting?: boolean
}

export default function SegmentModal({ tripId, passengers, segment, open, onClose, onCreated, onDelete, deleting }: Props) {
  const isEditing = Boolean(segment)
  const [showPassengers, setShowPassengers] = useState(true)
  const [passengerIds, setPassengerIds] = useState<string[]>(segment?.passengerIds ?? passengers.map((p) => p.id))
  const [addPassengerOpen, setAddPassengerOpen] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Import Itinerary — uploads a PDF/screenshot/photo to the same
  // extraction pipeline used elsewhere (see UploadDropzone), scoped to
  // this trip. On success the parser creates the segment(s) itself, so
  // we just refresh + close rather than populating the manual form.
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importDragOver, setImportDragOver] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importFileName, setImportFileName] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  async function handleImportFile(file: File) {
    setImportFileName(file.name)
    setImporting(true)
    setImportError(null)

    const form = new FormData()
    form.append('file', file)
    form.append('tripId', tripId)

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setImportError(data.error || 'Could not read that file — you can still add the segment manually below.')
        setImporting(false)
        return
      }
      onCreated()
      onClose()
    } catch {
      setImportError('Upload failed — you can still add the segment manually below.')
      setImporting(false)
    }
  }

  function handleImportFiles(files: FileList | null) {
    const file = files?.[0]
    if (file) handleImportFile(file)
  }

  // Reset local passenger selection whenever the modal opens (fresh dialog
  // each time) or the segment being edited changes — without this, the
  // state from a previous open would leak into the next one.
  useEffect(() => {
    if (open) setPassengerIds(segment?.passengerIds ?? passengers.map((p) => p.id))
  }, [open, segment, passengers])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Close on backdrop click
  function onOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  if (!open) return null

  return (
    <>
    <div className={styles.overlay} ref={overlayRef} onClick={onOverlayClick} aria-modal="true" role="dialog">
      <div className={styles.modal}>
        <button type="button" className={styles.closeBtn} aria-label="Close" onClick={onClose}>
          <X size={15} />
        </button>

        <div className={styles.pad}>
          <div className={styles.header}>
            <h2 className={styles.title}>
              <small className={styles.titleSmall}>Trip Segment</small>
              {isEditing && segment
                ? `${segment.transportType.charAt(0) + segment.transportType.slice(1).toLowerCase()}${segment.departureTime ? ` — ${formatDateLong(segment.departureTime)}` : ''}`
                : 'New Trip Segment'}
            </h2>
            {isEditing && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'rgba(229,72,77,0.12)', color: '#e5484d',
                  border: '1.5px solid rgba(229,72,77,0.3)', borderRadius: 'var(--radius-pill)',
                  padding: '6px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Trash2 size={13} />
                {deleting ? 'Deleting…' : 'Delete Trip Segment'}
              </button>
            )}
          </div>
          <hr className={styles.hr} />

          {/* Wrap TransportTypeForm — it handles its own submit/error/router.refresh.
              Keying on segment?.id forces a remount (fresh field state) when
              switching from editing one segment to another, or to create mode.
              afterPreview places the monitor checkbox / Linked Passengers /
              Import Itinerary content right below the live Segment Preview,
              above the rest of the form's input fields. */}
          <TransportTypeForm
            key={segment?.id ?? 'create'}
            tripId={tripId}
            segment={segment}
            passengerIds={passengerIds}
            onCreated={() => {
              onCreated()
              onClose()
            }}
            afterPreview={({ enabled, setEnabled }) => (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--ink)', margin: '20px 0 16px' }}>
                  <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                  I want Maestro to actively monitor this segment and give me updates.
                </label>

                {/* Linked Passengers collapsible */}
                {passengers.length > 0 && (
                  <>
                    <button
                      type="button"
                      className={styles.sectionToggle}
                      onClick={() => setShowPassengers((v) => !v)}
                      style={{ paddingBottom: '6px' }}
                    >
                      Linked Passengers
                      {showPassengers ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                    {showPassengers && (
                      <div className={styles.collapseBody} style={{ paddingTop: '0' }}>
                        <p className={styles.tinyNote} style={{ marginTop: '0', marginBottom: '16px' }}>Linked passengers will get updates when this segment's status changes.</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                          {passengers.map((p) => {
                            const selected = passengerIds.includes(p.id)
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() =>
                                  setPassengerIds((ids) => (selected ? ids.filter((id) => id !== p.id) : [...ids, p.id]))
                                }
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '6px',
                                  border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                                  borderRadius: 'var(--radius-pill)', padding: '8px 16px',
                                  fontSize: '13px', fontWeight: 500, color: 'var(--ink)',
                                  background: 'none', cursor: 'pointer',
                                }}
                              >
                                {p.name}
                                {selected && <Check size={14} style={{ color: 'var(--accent)' }} />}
                              </button>
                            )
                          })}
                          <button
                            type="button"
                            onClick={() => setAddPassengerOpen(true)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '6px',
                              border: '1.5px dashed var(--border)', borderRadius: 'var(--radius-pill)',
                              padding: '8px 16px', fontSize: '13px', fontWeight: 500, color: 'var(--muted)',
                              background: 'none', cursor: 'pointer',
                            }}
                          >
                            <Plus size={14} /> Add Passengers
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Import Itinerary only applies to creating a brand-new segment */}
                {!isEditing && (
                  <>
                    <div
                      className={styles.sectionToggle}
                      style={{ borderTop: passengers.length === 0 ? '1.5px solid var(--border-soft)' : 'none' }}
                    >
                      Import Itinerary <ChevronUp size={15} />
                    </div>
                    <div className={styles.collapseBody}>
                      <div
                        className={styles.dropZone}
                        style={importDragOver ? { background: 'var(--hover)', borderColor: 'var(--accent)' } : undefined}
                        onDragOver={(e) => { e.preventDefault(); setImportDragOver(true) }}
                        onDragLeave={() => setImportDragOver(false)}
                        onDrop={(e) => {
                          e.preventDefault()
                          setImportDragOver(false)
                          handleImportFiles(e.dataTransfer.files)
                        }}
                        onClick={() => !importing && importInputRef.current?.click()}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') importInputRef.current?.click() }}
                      >
                        <input
                          ref={importInputRef}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          style={{ display: 'none' }}
                          onChange={(e) => handleImportFiles(e.target.files)}
                        />
                        <CloudUpload size={24} style={{ margin: '0 auto 8px', display: 'block', color: 'var(--faint)' }} />
                        {importing
                          ? `READING ${importFileName?.toUpperCase() ?? 'FILE'}…`
                          : (<>DROP A PDF, SCREENSHOT, OR PHOTO OF YOUR ITINERARY<br />OR CLICK TO BROWSE · PDF, JPEG, PNG, WEBP</>)}
                      </div>
                      {importError && (
                        <p role="alert" style={{ fontSize: '11px', color: '#e5484d', marginTop: '-8px', marginBottom: '14px' }}>
                          {importError}
                        </p>
                      )}
                    </div>

                    {/* OR divider */}
                    <div className={styles.orDivider}>OR</div>
                  </>
                )}
              </>
            )}
          />
        </div>
      </div>
    </div>

      <EditPassengerModal
        tripId={tripId}
        passenger={null}
        open={addPassengerOpen}
        onClose={() => setAddPassengerOpen(false)}
        isFirstPassenger={passengers.length === 0}
      />
    </>
  )
}

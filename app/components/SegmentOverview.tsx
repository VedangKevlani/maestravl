'use client'
import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Check, X, Route } from 'lucide-react'
import { type SegmentDTO } from './types'
import { TransportTypeIcon } from './transportIcons'
import styles from '../styles/trip.module.css'

function formatTime(iso: string | null) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

// A segment "needs attention" for the overview strip's purposes if it's
// been flagged delayed/cancelled — mirrors trip.js's needs_attention flag,
// which this app models as segment.status rather than a separate field.
function needsAttention(segment: SegmentDTO) {
  return segment.status === 'DELAYED' || segment.status === 'CANCELLED'
}

export default function SegmentOverview({ segments, onAddSegment }: { segments: SegmentDTO[]; onAddSegment?: () => void }) {
  const stripRef = useRef<HTMLDivElement>(null)

  function handleAddSegment() {
    if (onAddSegment) {
      onAddSegment()
    } else {
      // Fallback: scroll to inline form (legacy path)
      document.getElementById('add-segment-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  if (segments.length === 0) {
    return (
      <div className={styles.overviewCard}>
        <div className={styles.overviewTop}>
          <div className={styles.overviewMsg}>
            <p>No segments yet — add your first one to start building this trip's timeline.</p>
          </div>
          <button type="button" className={styles.newSegBtn} onClick={handleAddSegment}>+ New Trip Segment</button>
        </div>
        <div className={styles.segStripEmpty}>
          <Route size={16} />
          <p>No trip segments yet. Add one to see it here.</p>
        </div>
      </div>
    )
  }

  const flagged = segments.find(needsAttention)

  function scrollToSegment(segmentId: string) {
    const target = document.getElementById(`seg-${segmentId}`)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.classList.add(styles.segBlockFlash)
    setTimeout(() => target.classList.remove(styles.segBlockFlash), 1400)
  }

  function scrollStrip(direction: -1 | 1) {
    stripRef.current?.scrollBy({ left: direction * 160, behavior: 'smooth' })
  }

  return (
    <div className={styles.overviewCard}>
      <div className={styles.overviewTop}>
        <div className={styles.overviewMsg}>
          <div className={`${styles.statusDot} ${!flagged ? styles.statusDotOk : ''}`} />
          {flagged ? (
            <p>
              <span style={{ color: 'var(--amber)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <TransportTypeIcon type={flagged.transportType} size={13} /> {flagged.provider || flagged.transportType}
              </span> at{' '}
              <span style={{ color: 'var(--amber)' }}>{formatTime(flagged.departureTime)}</span> needs your attention. Click the icon below to jump to it.
            </p>
          ) : (
            <p>Everything&rsquo;s on track. Maestro is watching your monitored segments.</p>
          )}
        </div>
        <button type="button" className={styles.newSegBtn} onClick={handleAddSegment}>+ New Trip Segment</button>
      </div>

      <div className={styles.segStrip}>
        <button type="button" className={styles.segArrow} onClick={() => scrollStrip(-1)} aria-label="Show previous segments">
          <ChevronLeft size={16} />
        </button>
        <div className={styles.segIcons} ref={stripRef}>
          {segments.map((s) => {
            const attention = needsAttention(s)
            return (
              <div key={s.id} className={styles.segIconItem}>
                <button
                  type="button"
                  className={styles.segIconCircle}
                  onClick={() => scrollToSegment(s.id)}
                  title={`${s.provider || s.transportType} at ${formatTime(s.departureTime)} — ${attention ? 'needs attention' : 'on track'}. Click to jump to it.`}
                >
                  <TransportTypeIcon type={s.transportType} size={16} />
                  <span className={`${styles.segIconCheck} ${attention ? styles.segIconCheckX : ''}`}>
                    {attention ? <X size={11} /> : <Check size={11} />}
                  </span>
                </button>
                <div className={`${styles.segIconTime} ${attention ? styles.segIconTimeAttention : ''}`}>{formatTime(s.departureTime)}</div>
              </div>
            )
          })}
        </div>
        <button type="button" className={styles.segArrow} onClick={() => scrollStrip(1)} aria-label="Show next segments">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

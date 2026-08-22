'use client'
import { Fragment, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Check, X, Route } from 'lucide-react'
import { type SegmentDTO } from './types'
import { TransportTypeIcon } from './transportIcons'
import styles from '../styles/trip.module.css'

// Mirrors trip.js's SEG_STRIP_MOBILE_QUERY / SEG_STRIP_MOBILE_PAGE_SIZE —
// the strip only pages on narrow viewports, showing two segments per
// page with arrows; on desktop the arrows stay hidden and every segment
// is always visible in the strip at once.
const SEG_STRIP_MOBILE_QUERY = '(max-width: 600px)'
const SEG_STRIP_MOBILE_PAGE_SIZE = 2

function useSegStripPaging(count: number) {
  const [isMobile, setIsMobile] = useState(false)
  const [page, setPage] = useState(0)

  useEffect(() => {
    const mql = window.matchMedia(SEG_STRIP_MOBILE_QUERY)
    const update = () => { setIsMobile(mql.matches); setPage(0) }
    update()
    mql.addEventListener('change', update)
    window.addEventListener('resize', update)
    return () => {
      mql.removeEventListener('change', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => { setPage(0) }, [count])

  const paginated = isMobile && count > SEG_STRIP_MOBILE_PAGE_SIZE
  const maxPage = Math.max(0, Math.ceil(count / SEG_STRIP_MOBILE_PAGE_SIZE) - 1)
  const clampedPage = Math.min(page, maxPage)
  const start = clampedPage * SEG_STRIP_MOBILE_PAGE_SIZE
  const end = start + SEG_STRIP_MOBILE_PAGE_SIZE

  return {
    paginated,
    isVisible: (i: number) => !paginated || (i >= start && i < end),
    showArrows: paginated,
    prevDisabled: clampedPage === 0,
    nextDisabled: clampedPage === maxPage,
    goPrev: () => setPage((p) => Math.max(0, p - 1)),
    goNext: () => setPage((p) => Math.min(maxPage, p + 1)),
  }
}

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
  const { isVisible, prevDisabled, nextDisabled, goPrev, goNext } = useSegStripPaging(segments.length)

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
          <button type="button" className={styles.newSegBtn} data-tour="add-segment-form" onClick={handleAddSegment}>+ New Trip Segment</button>
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

  // Few segments shouldn't get stretched edge-to-edge by justify-content:
  // space-between — that reads as a big empty gap with only 2-3 stops.
  // Switch to a centered, fixed-gap layout below a density threshold, and
  // let it spread to fill the strip once there are enough stops to need it.
  const isSparse = segments.length <= 3
  const densityClass = isSparse ? styles.segIconsSparse : ''

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
        <button type="button" className={styles.newSegBtn} data-tour="add-segment-form" onClick={handleAddSegment}>+ New Trip Segment</button>
      </div>

      <div className={styles.segStrip}>
        <button
          type="button"
          className={styles.segArrow}
          onClick={goPrev}
          disabled={prevDisabled}
          aria-label="Show previous segments"
        >
          <ChevronLeft size={16} />
        </button>
        <div className={`${styles.segIcons} ${densityClass}`}>
          {segments.map((s, i) => {
            const attention = needsAttention(s)
            const visible = isVisible(i)
            return (
              <Fragment key={s.id}>
                {isSparse && i > 0 && visible && isVisible(i - 1) && (
                  <div className={styles.segIconConnector} aria-hidden="true" />
                )}
                <div
                  className={styles.segIconItem}
                  style={{ display: visible ? undefined : 'none' }}
                >
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
              </Fragment>
            )
          })}
        </div>
        <button
          type="button"
          className={styles.segArrow}
          onClick={goNext}
          disabled={nextDisabled}
          aria-label="Show next segments"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

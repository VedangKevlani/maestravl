'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import BoardingPass from './BoardingPass'
import type { PassengerDTO, SegmentDTO } from './types'
import { checkItinerary } from '@/lib/itinerary/sanity'
import { displaySegmentLabel } from '@/lib/segmentLabel'
import styles from '../styles/trip.module.css'

// How often the boarding passes re-pull the page's server data while open,
// so a disruption the passenger didn't cause themselves (background
// monitoring, a provider's own reply landing) still surfaces within a few
// seconds rather than waiting for the next manual reload.
const REFRESH_POLL_MS = 4000

export default function Timeline({ tripId, segments, passengers, homeTimezone }: { tripId: string; segments: SegmentDTO[]; passengers: PassengerDTO[]; homeTimezone: string | null }) {
  const router = useRouter()
  const [items, setItems] = useState(segments)
  const [saving, setSaving] = useState(false)

  // The parent server component re-fetches (router.refresh()) after any
  // add/edit/delete; sync local state so those changes actually show up
  // instead of freezing at whatever `segments` looked like on first mount.
  useEffect(() => {
    setItems(segments)
  }, [segments])

  // Skipped mid-drag so a poll landing between pointerdown and drop can't
  // yank the list out from under a reorder in progress. Also skipped while
  // the tab is hidden — each tick re-runs the whole trip page's server
  // queries, and a background tab nobody is looking at doesn't need them —
  // with an immediate refresh on return so the view is never stale.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!saving && document.visibilityState === 'visible') router.refresh()
    }, REFRESH_POLL_MS)
    function onVisibilityChange() {
      if (!saving && document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [router, saving])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  )

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = items.findIndex((s) => s.id === active.id)
    const newIndex = items.findIndex((s) => s.id === over.id)
    const reordered = arrayMove(items, oldIndex, newIndex)
    setItems(reordered)

    setSaving(true)
    await fetch('/api/segments/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId, orderedSegmentIds: reordered.map((s) => s.id) }),
    })
    setSaving(false)
    router.refresh()
  }

  if (items.length === 0) {
    return <p className="text-editorial text-white/40" style={{ fontSize: '0.9rem' }}>No segments yet — import a document or add one manually below.</p>
  }

  return (
    <div data-tour="timeline">
      <ItineraryCheck segments={items} />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className={`${styles.segList} flex flex-col`}>
            {items.map((segment, i) => (
              <BoardingPass key={segment.id} tripId={tripId} segment={segment} passengers={passengers} nextSegment={items[i + 1] ?? null} homeTimezone={homeTimezone} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {saving && <p className="text-label text-white/25 mt-2" style={{ fontSize: '0.6rem' }}>saving order…</p>}
    </div>
  )
}

/**
 * Deterministic itinerary check (lib/itinerary/sanity.ts) — re-run on
 * every render from the same segments the passes show, so it updates the
 * moment a segment is saved, reordered, or rescheduled. Pure, with no
 * time-zone-dependent formatting, so server and client render the same.
 */
function ItineraryCheck({ segments }: { segments: SegmentDTO[] }) {
  const issues = useMemo(
    () => checkItinerary(segments.map((s) => ({ ...s, label: displaySegmentLabel(s) }))),
    [segments]
  )
  if (issues.length === 0) return null
  const conflicts = issues.filter((i) => i.severity === 'conflict').length
  return (
    <div
      role="status"
      className="rounded-2xl px-5 py-4 mb-5"
      style={{ background: conflicts ? 'rgba(229,72,77,0.08)' : 'rgba(212,168,83,0.08)', border: `1px solid ${conflicts ? 'rgba(229,72,77,0.3)' : 'rgba(212,168,83,0.3)'}` }}
    >
      <p className="text-editorial text-white" style={{ fontSize: '0.88rem' }}>
        {issues.length === 1 ? 'One thing in this itinerary looks off' : `${issues.length} things in this itinerary look off`}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {issues.map((issue, i) => (
          <li key={`${issue.code}-${issue.segmentId}-${i}`} className="text-editorial text-white/70" style={{ fontSize: '0.78rem' }}>
            <span style={{ color: issue.severity === 'conflict' ? '#e5484d' : '#d4a853' }}>{issue.severity === 'conflict' ? 'Conflict' : 'Check'}:</span>{' '}
            {issue.message}{' '}
            <a href={`#seg-${issue.segmentId}`} className="underline text-white/50 hover:text-white/80">Show</a>
          </li>
        ))}
      </ul>
    </div>
  )
}

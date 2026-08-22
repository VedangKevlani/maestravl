'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import BoardingPass from './BoardingPass'
import type { PassengerDTO, SegmentDTO } from './types'

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
  // yank the list out from under a reorder in progress.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!saving) router.refresh()
    }, REFRESH_POLL_MS)
    return () => clearInterval(timer)
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
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-3">
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

'use client'
// Thin client shell that owns the "add segment" modal open/close state.
// Mounted inside the server-component trip page so that SegmentOverview's
// "+ New Trip Segment" button can open a real overlay modal instead of
// scrolling to an inline form.  The server component passes the trip's
// passengers list so the modal can show the passenger picker.
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import SegmentOverview from './SegmentOverview'
import SegmentModal from './SegmentModal'
import type { TripDTO } from './types'

interface Props {
  segments: TripDTO['segments']
  passengers: TripDTO['passengers']
  tripId: string
}

export default function TripAddSegmentClient({ segments, passengers, tripId }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const router = useRouter()

  const openModal = useCallback(() => setModalOpen(true), [])
  const closeModal = useCallback(() => setModalOpen(false), [])
  const onCreated = useCallback(() => {
    setModalOpen(false)
    router.refresh()
  }, [router])

  return (
    <>
      <SegmentOverview segments={segments} onAddSegment={openModal} />
      <SegmentModal
        tripId={tripId}
        passengers={passengers}
        open={modalOpen}
        onClose={closeModal}
        onCreated={onCreated}
      />
    </>
  )
}

'use client'
import { useState } from 'react'
import type { PassengerDTO } from '../types'
import ManagePassengersModal from './ManagePassengersModal'

export default function PassengersPill({ tripId, passengers }: { tripId: string; passengers: PassengerDTO[] }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-label px-3 py-1.5 rounded-full whitespace-nowrap"
        style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem' }}
      >
        {passengers.length} passenger{passengers.length === 1 ? '' : 's'}
      </button>
      {open && <ManagePassengersModal tripId={tripId} passengers={passengers} onClose={() => setOpen(false)} />}
    </>
  )
}

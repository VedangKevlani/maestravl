'use client'
import { useState } from 'react'
import { friendlyZoneLabel } from '@/lib/dateFormat'

// Lets the passenger set (or correct) the "home" timezone the world clock
// (SegmentWorldClock.tsx) compares every segment against. Never guessed
// server-side — auto-suggested from the browser's own zone on click, same
// "Use mine" convention already used by the segment add/edit form
// (TransportTypeForm.tsx, shared by both flows via SegmentModal.tsx),
// and always editable after.
export default function HomeTimezoneBadge({ initialHomeTimezone }: { initialHomeTimezone: string | null }) {
  const [homeTimezone, setHomeTimezone] = useState(initialHomeTimezone)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  async function setToBrowserZone() {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    setSaving(true)
    const res = await fetch('/api/user', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeTimezone: detected }),
    })
    setSaving(false)
    if (res.ok) {
      setHomeTimezone(detected)
      setEditing(false)
    }
  }

  if (!homeTimezone) {
    return (
      <button
        onClick={setToBrowserZone}
        disabled={saving}
        className="text-editorial px-3 py-1.5 rounded-full border border-dashed border-white/20 text-white/40 hover:text-white/70 hover:border-white/40 disabled:opacity-50"
        style={{ fontSize: '0.82rem' }}
      >
        {saving ? 'Setting…' : '+ Set your home time zone'}
      </button>
    )
  }

  if (editing) {
    return (
      <span className="flex items-center gap-2 flex-wrap">
        <button
          onClick={setToBrowserZone}
          disabled={saving}
          className="text-label text-white/60 hover:text-white disabled:opacity-50"
          style={{ fontSize: '0.65rem' }}
        >
          {saving ? '…' : 'Use my current location'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-label text-white/30 hover:text-white/60"
          style={{ fontSize: '0.65rem' }}
        >
          Cancel
        </button>
      </span>
    )
  }

  return (
    <span
      className="text-editorial px-3 py-1.5 rounded-full glass-card flex items-center gap-1.5"
      style={{ fontSize: '0.82rem' }}
      title="Home time zone — used to show what time your trip's segments are in your terms"
    >
      Home: {friendlyZoneLabel(homeTimezone)}
      <button
        onClick={() => setEditing(true)}
        className="text-white/25 hover:text-white/70"
        style={{ fontSize: '0.7rem' }}
        aria-label="Edit home time zone"
        title="Edit home time zone"
      >
        ✎
      </button>
    </span>
  )
}

'use client'
import { useEffect, useState } from 'react'
import type { SegmentDTO } from './types'
import { resolveSegmentZones, friendlyZoneLabel, formatFriendlyTime, classifyArrivalHour } from '@/lib/dateFormat'

const SIGNIFICANCE_STYLES: Record<'LATE_NIGHT' | 'EARLY_MORNING', { bg: string; fg: string }> = {
  LATE_NIGHT: { bg: 'rgba(229,72,77,0.12)', fg: '#e5484d' },
  EARLY_MORNING: { bg: 'rgba(212,168,83,0.15)', fg: '#d4a853' },
}

function nowClock(timezone: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date())
}

/** Same date/time rendering as formatFriendlyTime, without the appended zone-name suffix — for "(that's X your time)" where the zone is already implied by context. */
function timeOnly(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone,
  }).format(date)
}

/**
 * Live current-time-at-location clocks (home / departure / arrival) plus a
 * plain-language "what time you'll actually land, in both places" figure,
 * visually flagged when the arrival falls at an inconvenient hour. Degrades
 * honestly rather than guessing: an unresolvable zone (see
 * lib/dateFormat.ts's resolveSegmentZones) just omits that column instead
 * of showing a wrong or fabricated time.
 */
export default function SegmentWorldClock({ segment, homeTimezone }: { segment: SegmentDTO; homeTimezone: string | null }) {
  const zones = resolveSegmentZones(segment)
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const columns: { label: string; timezone: string }[] = []
  if (homeTimezone) columns.push({ label: 'Home', timezone: homeTimezone })
  if (zones.departure) columns.push({ label: 'Departure', timezone: zones.departure })
  if (zones.arrival && zones.arrival !== zones.departure) columns.push({ label: 'Arrival', timezone: zones.arrival })

  if (columns.length === 0) return null

  const arrivalDate = segment.arrivalTime ? new Date(segment.arrivalTime) : null
  const showLanding = arrivalDate && zones.arrival
  const significance = showLanding ? classifyArrivalHour(arrivalDate!, zones.arrival!) : 'NORMAL'
  const significanceStyle = significance !== 'NORMAL' ? SIGNIFICANCE_STYLES[significance] : null
  const homeDiffers = showLanding && homeTimezone && homeTimezone !== zones.arrival

  return (
    <div className="flex flex-col gap-1.5 mt-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-editorial text-white/40" style={{ fontSize: '0.72rem' }}>
        {columns.map((c) => (
          <span key={c.label}>
            {c.label}: {nowClock(c.timezone)} <span className="text-white/25">({friendlyZoneLabel(c.timezone)})</span>
          </span>
        ))}
      </div>
      {showLanding && (
        <p
          className="text-editorial inline-block px-2 py-1 rounded-md w-fit"
          style={{
            fontSize: '0.72rem',
            background: significanceStyle?.bg ?? 'transparent',
            color: significanceStyle?.fg ?? 'rgba(255,255,255,0.4)',
          }}
        >
          Lands {formatFriendlyTime(arrivalDate!, zones.arrival)}
          {homeDiffers ? ` (that's ${timeOnly(arrivalDate!, homeTimezone)} your time)` : ''}
        </p>
      )}
    </div>
  )
}

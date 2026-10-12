// Pure — catches itinerary mistakes that would otherwise surface at the
// worst possible moment (at the gate), or silently make Maestravl's own
// disruption math wrong. Deterministic rules only; no AI is needed to
// notice that a flight lands after the next one leaves.
//
// Deliberately conservative — every check below has a concrete
// consequence, so a warning is worth reading:
// - OUT_OF_ORDER: the dependency engine (lib/dependency/graph.ts) walks
//   segments in their manual `order`. If that disagrees with their actual
//   times, a delay cascades into the wrong segments.
// - ENDS_BEFORE_START: almost always a typo (wrong date, AM/PM).
// - MISSED_CONNECTION / TIGHT_CONNECTION: the next leg leaves before, or
//   very soon after, the previous one arrives.
// - DIFFERENT_STATION: you land at one airport/station and the next leg
//   leaves from another — easy to miss when booking separately.
// Stays (hotels), meals, and activities are skipped as "previous leg" for
// connection checks: a dinner during a hotel stay isn't a conflict.
import { formatDuration } from '@/lib/dateFormat'

export type ItineraryIssueCode = 'OUT_OF_ORDER' | 'ENDS_BEFORE_START' | 'MISSED_CONNECTION' | 'TIGHT_CONNECTION' | 'DIFFERENT_STATION'

export interface ItineraryIssue {
  code: ItineraryIssueCode
  severity: 'conflict' | 'warning'
  segmentId: string
  message: string
}

export interface SanitySegment {
  id: string
  order: number
  transportType: string
  label: string
  departureTime: string | Date | null
  arrivalTime: string | Date | null
  departureLocationCode: string | null
  arrivalLocationCode: string | null
}

const NON_TRAVEL_TYPES = new Set(['HOTEL', 'RESTAURANT', 'EXCURSION', 'OTHER'])
// Typical minimums: an airline's own legal connection time at most hubs is
// 45-60 minutes; ground transport needs far less.
const MIN_CONNECTION_MINUTES: Record<string, number> = { FLIGHT: 45 }
const DEFAULT_MIN_CONNECTION_MINUTES = 15

const toMs = (t: string | Date | null) => (t ? new Date(t).getTime() : null)

export function checkItinerary(segments: SanitySegment[]): ItineraryIssue[] {
  const ordered = [...segments].sort((a, b) => a.order - b.order)
  const issues: ItineraryIssue[] = []

  for (const s of ordered) {
    const start = toMs(s.departureTime)
    const end = toMs(s.arrivalTime)
    if (start !== null && end !== null && end < start) {
      issues.push({
        code: 'ENDS_BEFORE_START',
        severity: 'conflict',
        segmentId: s.id,
        message: `${s.label} ends before it starts — check the dates and AM/PM.`,
      })
    }
  }

  // Out of order: a segment that starts earlier than one placed before it.
  let latestStartSoFar: { ms: number; label: string } | null = null
  for (const s of ordered) {
    const start = toMs(s.departureTime)
    if (start === null) continue
    if (latestStartSoFar && start < latestStartSoFar.ms) {
      issues.push({
        code: 'OUT_OF_ORDER',
        severity: 'warning',
        segmentId: s.id,
        message: `${s.label} starts before ${latestStartSoFar.label}, but comes after it in your timeline. Drag it into time order so Maestravl works out what a delay affects correctly.`,
      })
    } else {
      latestStartSoFar = { ms: start, label: s.label }
    }
  }

  // Connections between consecutive travel legs.
  const legs = ordered.filter((s) => !NON_TRAVEL_TYPES.has(s.transportType))
  for (let i = 1; i < legs.length; i++) {
    const prev = legs[i - 1]
    const next = legs[i]
    const prevEnd = toMs(prev.arrivalTime)
    const nextStart = toMs(next.departureTime)

    if (prevEnd !== null && nextStart !== null && nextStart >= toMs(prev.departureTime)!) {
      const gapMinutes = Math.round((nextStart - prevEnd) / 60_000)
      const minimum = MIN_CONNECTION_MINUTES[next.transportType] ?? DEFAULT_MIN_CONNECTION_MINUTES
      if (gapMinutes < 0) {
        issues.push({
          code: 'MISSED_CONNECTION',
          severity: 'conflict',
          segmentId: next.id,
          message: `${next.label} leaves ${formatDuration(-gapMinutes)} before ${prev.label} arrives.`,
        })
      } else if (gapMinutes < minimum) {
        issues.push({
          code: 'TIGHT_CONNECTION',
          severity: 'warning',
          segmentId: next.id,
          message: `Only ${formatDuration(gapMinutes)} between ${prev.label} arriving and ${next.label} leaving — under the usual ${formatDuration(minimum)} minimum.`,
        })
      }
    }

    const arriveAt = prev.arrivalLocationCode?.trim().toUpperCase()
    const leaveFrom = next.departureLocationCode?.trim().toUpperCase()
    if (arriveAt && leaveFrom && arriveAt !== leaveFrom) {
      issues.push({
        code: 'DIFFERENT_STATION',
        severity: 'warning',
        segmentId: next.id,
        message: `${prev.label} arrives at ${arriveAt}, but ${next.label} leaves from ${leaveFrom} — make sure you've planned how to get between them.`,
      })
    }
  }

  return issues
}

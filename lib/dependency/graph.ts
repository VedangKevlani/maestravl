// Deterministic dependency/impact engine — spec section 3 & Phase 3.
//
// The itinerary is a chronological chain of segments, not an explicit
// graph: whether segment B depends on segment A is entirely a function of
// their scheduled times and ordering, so there is no persisted `Dependency`
// table (see the note in prisma/schema.prisma) — this module computes the
// answer fresh from each segment's own order/time fields every time it's
// asked, which also means it can never drift out of sync with an edited
// itinerary.
//
// This is intentionally pure logic with no AI reasoning and no I/O, per
// spec section 17 ("build deterministic tests before adding complex AI
// reasoning") — an LLM-backed refinement can sit in front of this later
// (e.g. to reason about *why* a gap matters for a specific provider) without
// this module changing.
//
// The cascade model: each segment has its own scheduled start/end and thus
// its own fixed duration. A disruption shifts the disrupted segment's end
// by `delayMinutes`; every segment after it then has an *actual* start of
// max(its own originally scheduled start, the previous segment's actual
// end) — it can't start before it was scheduled to, but it can't start
// before the passenger is actually free from what came before it either —
// and an actual end of actualStart + its own original duration. This is
// standard connection-cascade math (the same shape as how airlines compute
// missed-connection risk), not a novel heuristic — only WARNING_BUFFER_MINUTES
// below is a tunable judgment call.

import type { TransportType } from '@/lib/constants'
import type { SegmentImpactLevel } from '@/lib/constants'
import { formatDuration } from '@/lib/dateFormat'

// How much slack (in minutes) between a segment's scheduled start and the
// disruption-shifted actual end of whatever precedes it still counts as
// "fine" rather than "tight." Zero or below is DIRECT (an outright
// scheduling conflict). This is a tunable heuristic, not a physical
// constant — it errs toward flagging too much rather than too little,
// since a missed connection is far more costly to the passenger than an
// unnecessary "this might be affected" notice.
export const WARNING_BUFFER_MINUTES = 120

export interface DependencySegment {
  id: string
  order: number
  transportType: TransportType
  departureTime: Date | null
  arrivalTime: Date | null
}

export interface SegmentImpact {
  segmentId: string
  level: SegmentImpactLevel
  /** Minutes between this segment's scheduled start and the disruption-shifted actual end of whatever precedes it. Negative means an outright conflict. Null when it couldn't be computed (missing schedule data). */
  bufferMinutes: number | null
  /** The concrete new start time to propose to this segment's provider — only set for DIRECT impacts from a delay (there's nothing meaningful to "reschedule to" for a POTENTIAL/UNAFFECTED segment, or for a cancellation, where nothing computes a specific new time). */
  shiftedStart: Date | null
  reason: string
}

const MS_PER_MINUTE = 60_000

/** A segment's own end, for the purposes of "when is the passenger free to move on" — arrival if known, otherwise departure. */
function effectiveEnd(segment: DependencySegment): Date | null {
  return segment.arrivalTime ?? segment.departureTime ?? null
}

/** A segment's own start, for the purposes of "when does the next thing need this segment to be done." */
function effectiveStart(segment: DependencySegment): Date | null {
  return segment.departureTime ?? segment.arrivalTime ?? null
}

/**
 * Classifies every segment scheduled after `disruptedSegmentId` as DIRECT
 * (the disruption-shifted timeline conflicts with this segment's scheduled
 * start), POTENTIAL (buffer shrinks to within WARNING_BUFFER_MINUTES but
 * doesn't break), or UNAFFECTED (enough buffer absorbs the shift).
 *
 * Segments scheduled at or before the disrupted one are omitted entirely —
 * they already happened or aren't affected by a delay to something later.
 */
export function calculateImpact(
  segments: DependencySegment[],
  disruptedSegmentId: string,
  delayMinutes: number
): SegmentImpact[] {
  const ordered = [...segments].sort((a, b) => a.order - b.order)
  const disruptedIndex = ordered.findIndex((s) => s.id === disruptedSegmentId)
  if (disruptedIndex === -1 || delayMinutes <= 0) return []

  const disrupted = ordered[disruptedIndex]
  const disruptedEnd = effectiveEnd(disrupted)
  // actualEnd tracks the disruption-shifted end of the last segment in the
  // chain we could compute — the anchor the next segment's buffer is
  // measured against.
  let actualEnd = disruptedEnd ? new Date(disruptedEnd.getTime() + delayMinutes * MS_PER_MINUTE) : null

  const results: SegmentImpact[] = []

  for (let i = disruptedIndex + 1; i < ordered.length; i++) {
    const segment = ordered[i]
    const segStart = effectiveStart(segment)

    if (!actualEnd || !segStart) {
      // Can't compute a buffer without both timestamps — surface the
      // uncertainty (per spec section 20, never silently assume UNAFFECTED)
      // rather than guessing. Leave actualEnd anchored at the last
      // known-good time so a later segment with real timestamps can still
      // be evaluated correctly.
      results.push({
        segmentId: segment.id,
        level: 'POTENTIAL',
        bufferMinutes: null,
        shiftedStart: null,
        reason: 'Missing scheduled time on this or the preceding segment — cannot compute a buffer, review manually.',
      })
      continue
    }

    const bufferMinutes = Math.round((segStart.getTime() - actualEnd.getTime()) / MS_PER_MINUTE)

    // This segment's actual start can't be earlier than scheduled, but
    // also can't be earlier than the previous segment's actual end.
    const actualStart = segStart.getTime() > actualEnd.getTime() ? segStart : actualEnd

    let level: SegmentImpactLevel
    let reason: string
    if (bufferMinutes < 0) {
      level = 'DIRECT'
      reason = `The shifted schedule overruns this segment's start by ${formatDuration(-bufferMinutes)}.`
    } else if (bufferMinutes <= WARNING_BUFFER_MINUTES) {
      level = 'POTENTIAL'
      reason = `Only ${formatDuration(bufferMinutes)} of buffer remains before this segment — tight, but not an outright conflict.`
    } else {
      level = 'UNAFFECTED'
      reason = `${formatDuration(bufferMinutes)} of buffer comfortably absorbs the shift.`
    }

    results.push({
      segmentId: segment.id,
      level,
      bufferMinutes,
      shiftedStart: level === 'DIRECT' ? actualStart : null,
      reason,
    })

    // Its own actual end preserves its original duration from actualStart,
    // and becomes the anchor the next segment's buffer is measured against.
    const segEnd = effectiveEnd(segment) ?? segStart
    const durationMs = segEnd.getTime() - segStart.getTime()
    actualEnd = new Date(actualStart.getTime() + durationMs)
  }

  return results
}

/**
 * Every segment scheduled after a cancelled one is DIRECT — there's no
 * partial-buffer math to do, since the segment they were built around
 * connecting from simply won't happen. Distinct from calculateImpact
 * (which is about a shifted timeline, not a missing one) rather than a
 * special-cased delayMinutes value, so callers can't accidentally pass
 * Infinity/NaN and get a nonsense result out of the buffer arithmetic.
 */
export function calculateCancellationImpact(
  segments: DependencySegment[],
  disruptedSegmentId: string
): SegmentImpact[] {
  const ordered = [...segments].sort((a, b) => a.order - b.order)
  const disruptedIndex = ordered.findIndex((s) => s.id === disruptedSegmentId)
  if (disruptedIndex === -1) return []

  return ordered.slice(disruptedIndex + 1).map((segment) => ({
    segmentId: segment.id,
    level: 'DIRECT' as const,
    bufferMinutes: null,
    shiftedStart: null,
    reason: 'The segment it connects from was cancelled.',
  }))
}

// How much later than the primary proposed time the backup option asks
// for — a modest safety margin in case the passenger's actual arrival
// slips further, not a second guess at the delay itself.
const ALTERNATIVE_BUFFER_MINUTES = 45

export interface AlternativeOption {
  label: string
  proposedTime: Date
  /** Effect on the *next* segment after the affected one if this option were used instead of the primary ask — NONE if there's nothing after it, or nothing that would notice. */
  downstreamImpact: 'NONE' | 'MINOR' | 'MAJOR'
  rank: number
}

/**
 * Rescheduling Agent (spec section 8) — deterministic, not a live
 * availability check (nothing in this codebase can ask a hotel/restaurant
 * "what times do you have"). Rank 1 is always the exact time computed by
 * calculateImpact (the least disruptive possible ask, since anything later
 * can only match or worsen downstream impact — never improve it). Rank 2
 * is a modest buffer past that, offered as a fallback in case the
 * passenger's actual arrival slips further than expected, so the provider
 * has an alternative to say yes to instead of a flat no.
 */
export function rankAlternatives(
  segments: DependencySegment[],
  affectedSegmentId: string,
  primaryProposedTime: Date
): AlternativeOption[] {
  const ordered = [...segments].sort((a, b) => a.order - b.order)
  const index = ordered.findIndex((s) => s.id === affectedSegmentId)
  if (index === -1) return []

  const affected = ordered[index]
  const affectedStart = effectiveStart(affected)
  const affectedEnd = effectiveEnd(affected)
  const durationMs = affectedStart && affectedEnd ? affectedEnd.getTime() - affectedStart.getTime() : 0

  const next = ordered[index + 1]
  const nextStart = next ? effectiveStart(next) : null

  function downstreamImpactOf(candidateStart: Date): AlternativeOption['downstreamImpact'] {
    if (!nextStart) return 'NONE'
    const candidateEnd = new Date(candidateStart.getTime() + durationMs)
    const bufferMinutes = Math.round((nextStart.getTime() - candidateEnd.getTime()) / MS_PER_MINUTE)
    if (bufferMinutes < 0) return 'MAJOR'
    if (bufferMinutes <= WARNING_BUFFER_MINUTES) return 'MINOR'
    return 'NONE'
  }

  const backupTime = new Date(primaryProposedTime.getTime() + ALTERNATIVE_BUFFER_MINUTES * MS_PER_MINUTE)

  return [
    { label: 'Option A', proposedTime: primaryProposedTime, downstreamImpact: downstreamImpactOf(primaryProposedTime), rank: 1 },
    { label: 'Option B', proposedTime: backupTime, downstreamImpact: downstreamImpactOf(backupTime), rank: 2 },
  ]
}

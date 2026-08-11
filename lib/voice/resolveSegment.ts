// Pure — matches how a passenger refers to a segment out loud ("AA123",
// "the flight to Miami", "next", "my hotel") against the trip's real
// segments. Never silently guesses: ambiguous or no-match results carry the
// real candidate list back, so the caller can ask a grounded clarifying
// question instead of the LLM inventing one.
import type { VoiceSegment } from './types'

export type SegmentResolveResult =
  | { type: 'found'; segment: VoiceSegment }
  | { type: 'ambiguous'; candidates: VoiceSegment[] }
  | { type: 'not_found' }

// Individual distinguishing terms, not one joined blob — a spoken query is
// usually a full phrase ("the flight to Miami") that CONTAINS a short
// distinguishing term ("Miami"), while a precise query ("AA123") is itself
// contained BY a term. Checking containment both ways over separate terms
// catches both without either swallowing the other into a false match.
//
// transportType is deliberately excluded from this list: it's an ordinary
// English word ("flight", "hotel") that shows up in almost any natural
// phrasing about that kind of segment, so substring-matching it against a
// full sentence would match every segment of that type, not just the one
// meant. It's handled separately, only against a short/exact query.
function segmentSearchTerms(segment: VoiceSegment): string[] {
  return [
    segment.identifier,
    segment.provider,
    segment.departureLocation,
    segment.departureLocationCode,
    segment.arrivalLocation,
    segment.arrivalLocationCode,
  ]
    .filter((v): v is string => Boolean(v))
    .map((v) => v.toLowerCase())
}

function matchesQuery(segment: VoiceSegment, query: string): boolean {
  if (segment.transportType.toLowerCase() === query) return true
  return segmentSearchTerms(segment).some((term) => query.includes(term) || term.includes(query))
}

const NOT_YET_ARRIVED_STATUSES = new Set(['SCHEDULED', 'BOARDING', 'DEPARTED', 'DELAYED'])

export function resolveSegment(segments: VoiceSegment[], query: string, now: Date): SegmentResolveResult {
  if (segments.length === 0) return { type: 'not_found' }

  const normalized = query.trim().toLowerCase()

  if (normalized === 'next' || normalized === 'upcoming') {
    const upcoming = segments
      .filter((s) => NOT_YET_ARRIVED_STATUSES.has(s.status) && s.departureTime && s.departureTime.getTime() >= now.getTime())
      .sort((a, b) => a.departureTime!.getTime() - b.departureTime!.getTime())
    return upcoming[0] ? { type: 'found', segment: upcoming[0] } : { type: 'not_found' }
  }

  if (normalized === 'first') {
    const first = [...segments].sort((a, b) => a.order - b.order)[0]
    return first ? { type: 'found', segment: first } : { type: 'not_found' }
  }

  if (normalized === 'last') {
    const last = [...segments].sort((a, b) => b.order - a.order)[0]
    return last ? { type: 'found', segment: last } : { type: 'not_found' }
  }

  const matches = segments.filter((s) => matchesQuery(s, normalized))
  if (matches.length === 0) return { type: 'not_found' }
  if (matches.length === 1) return { type: 'found', segment: matches[0] }
  return { type: 'ambiguous', candidates: matches }
}

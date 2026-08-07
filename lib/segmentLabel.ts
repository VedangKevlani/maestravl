// Shared by lib/monitoring/service.ts, lib/agents/*, and any API route that
// needs a human-readable name for a segment (e.g. "AA123 (KIN -> MIA)").
// Kept in its own module rather than under lib/monitoring/ so lib/agents/
// (which reacts to monitoring output) doesn't have to import back into
// lib/monitoring/ to get it.
export function segmentLabel(segment: {
  identifier: string | null
  provider: string | null
  departureLocationCode: string | null
  arrivalLocationCode: string | null
}) {
  const name = segment.identifier || segment.provider || 'Your trip segment'
  const route =
    segment.departureLocationCode && segment.arrivalLocationCode
      ? ` (${segment.departureLocationCode} → ${segment.arrivalLocationCode})`
      : ''
  return `${name}${route}`
}

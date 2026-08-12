// Communication Agent (message drafting half) — spec section 6. Pure,
// template-based composition — no LLM, consistent with the rest of this
// codebase's zero-paid-API extraction/notification pipeline. Every message
// only ever *requests* or *informs* — per spec section 6, "Messages must
// NEVER claim something has been confirmed when it has only been
// requested," so there is no "confirmed" language anywhere in these
// templates; confirmation only happens once a provider actually replies
// (not yet automated — see docs/ARCHITECTURE.md).

import type { MonitoringCheckStatus } from '@/lib/monitoring/types'
import { formatFriendlyTime, formatDuration } from '@/lib/dateFormat'

// Renders a time in the *segment's own* timezone, plain-language zone name
// (e.g. "New York time", not "EST") — never the server's incidental local
// zone. Re-exported here (formatTime/formatDuration) so every existing
// caller of this file (orchestrator.ts, email.ts) keeps working; the actual
// implementation lives in lib/dateFormat.ts, shared with every other
// display site in the app (UI, dashboard, activity log) so they never
// drift into showing different times for the same instant.
export const formatTime = formatFriendlyTime
export { formatDuration }

/** Plain-language reason for the outreach, built from the triggering disruption — used as the opening line of every message below. */
export function describeDisruptionReason(
  disruptedSegmentLabel: string,
  newStatus: MonitoringCheckStatus,
  delayMinutes: number | null
): string {
  if (newStatus === 'CANCELLED') {
    return `Our passenger's ${disruptedSegmentLabel} was cancelled.`
  }
  if (delayMinutes && delayMinutes > 0) {
    return `Our passenger's ${disruptedSegmentLabel} has been delayed by approximately ${formatDuration(delayMinutes)}.`
  }
  return `Our passenger's ${disruptedSegmentLabel} status has changed.`
}

export interface ComposedMessage {
  subject: string
  body: string
}

/** A concrete ask: "can this move to this specific new time?" — used when the dependency engine produced a shiftedStart (a DIRECT impact from a delay). */
export function composeRescheduleRequest(input: {
  segmentLabel: string
  confirmationNumber: string | null
  originalTime: Date | null
  proposedTime: Date
  /** IANA zone (e.g. "America/Los_Angeles") for the segment being rescheduled — this is the provider's own location, which is what matters to them, not wherever Maestravl's server happens to run. Null renders as "local time," labeled honestly rather than guessing a specific zone. */
  timezone: string | null
  reasonText: string
  /** A later fallback time (see lib/dependency/graph.ts's rankAlternatives) offered as a second option — gives the provider something to say yes to if the primary ask doesn't work, rather than a flat no. Omitted entirely when there's no meaningful alternative to offer. */
  alternativeTime?: Date | null
}): ComposedMessage {
  const bookingLine = input.confirmationNumber ? ` (Booking ${input.confirmationNumber})` : ''
  const subject = `Request to reschedule — ${input.segmentLabel}${bookingLine}`

  const confirmLine = input.alternativeTime
    ? `Could you please confirm whether either of these times would work?`
    : 'Could you please confirm whether this change is possible?'

  const body = [
    'Hello,',
    '',
    input.reasonText,
    '',
    ...(input.originalTime ? ['Original time:', formatTime(input.originalTime, input.timezone), ''] : []),
    input.alternativeTime ? 'Preferred new time:' : 'Requested new time:',
    formatTime(input.proposedTime, input.timezone),
    '',
    ...(input.alternativeTime ? ['Alternative, if that doesn\'t work:', formatTime(input.alternativeTime, input.timezone), ''] : []),
    ...(input.confirmationNumber ? ['Booking:', input.confirmationNumber, ''] : []),
    confirmLine,
    '',
    'Thank you,',
    'Maestravl, coordinating on behalf of the passenger',
  ].join('\n')

  return { subject, body }
}

/** A softer, non-committal heads-up — used for a POTENTIAL impact, or a cancellation's downstream segments, where there's no single concrete new time to propose. */
export function composeAwarenessInquiry(input: {
  segmentLabel: string
  confirmationNumber: string | null
  reasonText: string
}): ComposedMessage {
  const bookingLine = input.confirmationNumber ? ` (Booking ${input.confirmationNumber})` : ''
  const subject = `Heads up regarding your booking — ${input.segmentLabel}${bookingLine}`

  const body = [
    'Hello,',
    '',
    input.reasonText,
    '',
    `We wanted to flag this in case it affects our passenger's ${input.segmentLabel}. Could you let us know if any changes are needed, or if any updated information is needed from us?`,
    '',
    ...(input.confirmationNumber ? ['Booking:', input.confirmationNumber, ''] : []),
    'Thank you,',
    'Maestravl, coordinating on behalf of the passenger',
  ].join('\n')

  return { subject, body }
}

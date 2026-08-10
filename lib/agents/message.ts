// Communication Agent (message drafting half) — spec section 6. Pure,
// template-based composition — no LLM, consistent with the rest of this
// codebase's zero-paid-API extraction/notification pipeline. Every message
// only ever *requests* or *informs* — per spec section 6, "Messages must
// NEVER claim something has been confirmed when it has only been
// requested," so there is no "confirmed" language anywhere in these
// templates; confirmation only happens once a provider actually replies
// (not yet automated — see docs/ARCHITECTURE.md).

import type { MonitoringCheckStatus } from '@/lib/monitoring/types'

const TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins} minutes`
  if (mins === 0) return `${hours} hour${hours === 1 ? '' : 's'}`
  return `${hours} hour${hours === 1 ? '' : 's'} ${mins} minutes`
}

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
  reasonText: string
}): ComposedMessage {
  const bookingLine = input.confirmationNumber ? ` (Booking ${input.confirmationNumber})` : ''
  const subject = `Request to reschedule — ${input.segmentLabel}${bookingLine}`

  const body = [
    'Hello,',
    '',
    input.reasonText,
    '',
    ...(input.originalTime ? ['Original time:', TIME_FORMAT.format(input.originalTime), ''] : []),
    'Requested new time:',
    TIME_FORMAT.format(input.proposedTime),
    '',
    'Booking:',
    input.confirmationNumber ?? 'N/A',
    '',
    'Could you please confirm whether this change is possible?',
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
    'Booking:',
    input.confirmationNumber ?? 'N/A',
    '',
    'Thank you,',
    'Maestravl, coordinating on behalf of the passenger',
  ].join('\n')

  return { subject, body }
}

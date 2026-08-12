// Pure validation for a manually-reported delay — extracted from
// app/api/segments/[id]/report-disruption/route.ts so the voice assistant's
// report_delay tool (lib/voice/toolExecutors.ts) can apply the exact same
// rules instead of a second, potentially-drifting copy. The route computes
// delayMinutes here rather than trusting a minutes-late count from the
// caller, so whoever reports it (a form or a spoken sentence) only has to
// say what time it now is, not do the subtraction themselves.
export type ManualDelayResult = { delayMinutes: number } | { error: string }

export function computeManualDelayMinutes(
  scheduledDepartureTime: Date | null,
  newDepartureTimeIso: string,
  timeLabelLower: string
): ManualDelayResult {
  if (!scheduledDepartureTime) {
    return { error: `This segment doesn't have a scheduled ${timeLabelLower} on file — set one first (Edit), then report the delay.` }
  }
  const delayMinutes = Math.round((new Date(newDepartureTimeIso).getTime() - scheduledDepartureTime.getTime()) / 60_000)
  if (delayMinutes <= 0) {
    return { error: `The new ${timeLabelLower} must be after the originally scheduled time.` }
  }
  if (delayMinutes > 2880) {
    // Cap at 48h — anything longer isn't really a "delay" anymore.
    return { error: "That's more than 48 hours later — report this as cancelled instead." }
  }
  return { delayMinutes }
}

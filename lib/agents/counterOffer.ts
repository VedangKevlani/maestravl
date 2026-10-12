// Pure — pulls the one new time out of a provider's counter-offer ("we
// can't do 2pm, but 5:30pm works"), so the passenger can accept it in one
// click instead of reading the reply and editing the segment by hand.
//
// Deterministic (chrono-node, already a dependency) rather than another
// Gemini call: reply interpretation already spends one call from Gemini's
// free tier (a hard 20 requests/day) to decide the reply IS a counter-
// offer; reading a time out of a sentence is something a date parser does
// reliably for free. Conservative on purpose — it returns null rather than
// guess whenever the reply mentions more than one new time, mentions none,
// or never names an hour. A null just means "read it yourself", which is
// exactly what happened before this existed.
import * as chrono from 'chrono-node'
import { utcToZonedDateTimeParts, zonedDateTimeToUtc } from '@/lib/dateFormat'

const SAME_TIME_TOLERANCE_MS = 60_000

export function extractCounterOfferTime(
  replyText: string,
  opts: {
    /** The time Maestravl asked for — anchors dates the reply leaves implicit ("5:30pm" = that day). */
    referenceTime: Date
    /** The segment's zone; the reply's times are read as local time there. */
    timezone: string | null
    /** Times Maestravl itself offered — a reply repeating one of these isn't proposing anything new. */
    offeredTimes: Date[]
  }
): Date | null {
  // chrono resolves implied fields (the day, when only a time is given)
  // from its reference in the *runtime's* zone. Handing it a reference
  // whose runtime-local wall clock equals the segment's local wall clock
  // makes those implied fields come out right wherever this code runs;
  // only the parsed wall-clock parts are used, never chrono's own instant.
  const ref = utcToZonedDateTimeParts(opts.referenceTime, opts.timezone)
  const localReference = new Date(`${ref.date}T${ref.time}:00`)
  const results = chrono.parse(replyText, localReference, { forwardDate: true })

  const candidates: Date[] = []
  for (const r of results) {
    if (!r.start.isCertain('hour')) continue
    const pad = (n: number) => String(n).padStart(2, '0')
    const date = `${r.start.get('year')}-${pad(r.start.get('month') ?? 1)}-${pad(r.start.get('day') ?? 1)}`
    const time = `${pad(r.start.get('hour') ?? 0)}:${pad(r.start.get('minute') ?? 0)}`
    const instant = zonedDateTimeToUtc(date, time, opts.timezone)
    if (isNaN(instant.getTime())) continue
    const alreadyOffered = opts.offeredTimes.some((t) => Math.abs(t.getTime() - instant.getTime()) < SAME_TIME_TOLERANCE_MS)
    const duplicate = candidates.some((c) => Math.abs(c.getTime() - instant.getTime()) < SAME_TIME_TOLERANCE_MS)
    if (!alreadyOffered && !duplicate) candidates.push(instant)
  }
  return candidates.length === 1 ? candidates[0] : null
}

// Pure — executes each of the model's tool calls against an already-fetched
// VoiceContext (see lib/voice/tripContext.ts). No DB access happens here:
// the trip's data is small and trip-scoped, so it's fetched once per turn
// in the API route rather than once per tool call, keeping this whole
// module a plain synchronous fixture-testable function set. Nothing here
// writes to a trip: executeProposeAction (below) only prepares an action
// for the passenger to confirm with a tap.
import { segmentLabel } from '@/lib/segmentLabel'
import { STATUS_COPY, actionLabel } from '@/lib/agents/statusCopy'
import { resolveSegmentZones, formatFriendlyTime, utcToZonedDateTimeParts, zonedDateTimeToUtc, friendlyZoneLabel } from '@/lib/dateFormat'
import { lookupAirport } from '@/lib/data/airports'
import { checkItinerary } from '@/lib/itinerary/sanity'
import { resolveSegment } from './resolveSegment'
import { zoneForPlaceName, localTimeReport } from './aroundPure'
import { EDITABLE_SEGMENT_FIELDS } from './types'
import type { VoiceContext, VoiceSegment, ProposedAction, VoiceAccountContext } from './types'
import type { z } from 'zod'
import type { ProposeActionArgsSchema } from './tools'

type ProposeActionArgs = z.infer<typeof ProposeActionArgsSchema>

// Handing the model a bare UTC ISO string left it to do its own timezone
// math when speaking a time aloud — unreliable, and the source of a real
// bug (a 12:00 PM local departure read back as 3:00 PM). Pre-formatting
// with the segment's actual resolved zone, the same way every other
// passenger-facing surface does via lib/dateFormat.ts, means the model
// only ever repeats a time Maestravl already computed, never converts one
// itself.
function describeSegment(segment: VoiceSegment) {
  const zones = resolveSegmentZones(segment)
  return {
    label: segmentLabel(segment),
    transportType: segment.transportType,
    status: segment.status,
    departure:
      segment.departureLocation || segment.departureTime
        ? {
            location: segment.departureLocation,
            code: segment.departureLocationCode,
            time: segment.departureTime ? formatFriendlyTime(segment.departureTime, zones.departure) : null,
          }
        : null,
    arrival:
      segment.arrivalLocation || segment.arrivalTime
        ? {
            location: segment.arrivalLocation,
            code: segment.arrivalLocationCode,
            time: segment.arrivalTime ? formatFriendlyTime(segment.arrivalTime, zones.arrival) : null,
          }
        : null,
    confirmationNumber: segment.confirmationNumber,
    notes: segment.notes,
  }
}

export function executeGetItinerary(context: VoiceContext) {
  return {
    trip: { title: context.trip.title, status: context.trip.status },
    passengers: context.passengers.map((p) => ({ name: p.name, isPrimary: p.isPrimary })),
    segments: [...context.segments].sort((a, b) => a.order - b.order).map(describeSegment),
  }
}

function notFoundResult(context: VoiceContext) {
  return {
    found: false as const,
    message: 'No segment matched that description.',
    availableSegments: context.segments.map((s) => segmentLabel(s)),
  }
}

function ambiguousResult(candidates: VoiceSegment[]) {
  return {
    found: false as const,
    message: 'More than one segment matches that description — ask the passenger which one they mean.',
    candidates: candidates.map((s) => segmentLabel(s)),
  }
}

export function executeGetSegmentStatus(context: VoiceContext, args: { segment: string }) {
  const result = resolveSegment(context.segments, args.segment, context.now)
  if (result.type === 'not_found') return notFoundResult(context)
  if (result.type === 'ambiguous') return ambiguousResult(result.candidates)

  const segment = result.segment
  return {
    found: true as const,
    segment: describeSegment(segment),
    liveStatus: segment.monitoringStatus,
    liveStatusCheckedAt: segment.monitoringCheckedAt?.toISOString() ?? null,
  }
}

export function executeGetRecoveryActivity(context: VoiceContext, args: { segment?: string }) {
  let runs = context.recentRuns

  if (args.segment) {
    const result = resolveSegment(context.segments, args.segment, context.now)
    if (result.type === 'not_found') return notFoundResult(context)
    if (result.type === 'ambiguous') return ambiguousResult(result.candidates)
    runs = runs.filter((r) => r.segmentId === result.segment.id)
  }

  if (runs.length === 0) {
    return { found: true as const, hasActivity: false as const, message: 'Nothing is currently being handled for this trip.' }
  }

  return {
    found: true as const,
    hasActivity: true as const,
    runs: runs.map((run) => ({
      segment: run.segmentLabel,
      headline: STATUS_COPY[run.status]?.headline ?? run.status,
      isResolved: run.status === 'COMPLETED' || run.status === 'CONFIRMED',
      delayMinutes: run.delayMinutes,
      recentActions: run.actions.slice(-5).map((a) => ({
        summary: actionLabel(a.type, a.description),
        detail: a.description,
        status: a.status,
      })),
    })),
  }
}

// --- propose_action ---------------------------------------------------
// Pure. Validates a requested action against the trip's real state and,
// if it can actually be done, returns a ProposedAction for the chat to
// show as a confirmation card. Nothing is executed here or anywhere on the
// server as a result of this call — only the passenger's tap does that,
// through the same endpoints (and the same ownership/status checks) as the
// buttons in the app. So the assistant can never do more than the
// passenger could, and never does anything they didn't see and confirm.

type ProposeResult = { result: Record<string, unknown>; proposal: ProposedAction | null }

function refuse(message: string): ProposeResult {
  return { result: { proposed: false, message }, proposal: null }
}

function proposed(proposal: ProposedAction): ProposeResult {
  return {
    result: {
      proposed: true,
      cardShownToPassenger: proposal.title,
      instruction: 'Tell the passenger you have prepared this and they need to tap Confirm on the card in the chat. It has NOT happened yet — never say it is done.',
    },
    proposal,
  }
}

const NOTIFY_DETAIL = 'Maestravl will work out what else this affects and notify the passengers on this trip. It asks before contacting any provider.'

export function executeProposeAction(context: VoiceContext, args: ProposeActionArgs): ProposeResult {
  const base = { runId: null, communicationId: null, newDepartureTime: null, detail: null, tripId: context.trip.id, passenger: null, segmentUpdate: null }

  // The one action that isn't about a segment.
  if (args.action === 'add_passenger') {
    if (!args.passengerName) return refuse("Ask for the passenger's name first (email and phone are optional).")
    const name = args.passengerName
    const notified = [args.passengerEmail && 'an email', args.passengerPhone && 'a text'].filter(Boolean)
    return proposed({
      ...base,
      kind: 'add_passenger',
      segmentId: '',
      title: `Add ${name} to "${context.trip.title}"`,
      detail: [
        [args.passengerEmail, args.passengerPhone].filter(Boolean).join(' · ') || null,
        notified.length
          ? `They'll get ${notified.join(' and ')} confirming they were added, and updates if anything changes.`
          : "With no email or phone, they won't receive updates.",
      ]
        .filter(Boolean)
        .join(' — '),
      passenger: { name, email: args.passengerEmail ?? null, phone: args.passengerPhone ?? null },
    })
  }

  if (!args.segment) return refuse('Ask which segment this is about.')
  const resolved = resolveSegment(context.segments, args.segment, context.now)
  if (resolved.type === 'not_found') return { result: notFoundResult(context), proposal: null }
  if (resolved.type === 'ambiguous') return { result: ambiguousResult(resolved.candidates), proposal: null }

  const segment = resolved.segment
  const label = segmentLabel(segment)
  const zone = resolveSegmentZones(segment).departure
  const segBase = { ...base, segmentId: segment.id }

  switch (args.action) {
    case 'report_delay': {
      if (!segment.departureTime) return refuse(`${label} has no scheduled time to compare against, so a delay can't be worked out. The passenger can add the time with Manage on the segment.`)
      if (!args.newTime) return refuse('Ask the passenger for the new time first (and the date, if it moved to another day).')
      const date = args.newDate ?? utcToZonedDateTimeParts(segment.departureTime, zone).date
      const [h, m] = args.newTime.split(':')
      const instant = zonedDateTimeToUtc(date, `${h.padStart(2, '0')}:${m}`, zone)
      if (isNaN(instant.getTime())) return refuse("That time didn't make sense — ask the passenger to say it again.")
      if (instant.getTime() <= segment.departureTime.getTime()) {
        return refuse(`That's not later than ${label}'s scheduled time of ${formatFriendlyTime(segment.departureTime, zone)} — check the time with the passenger.`)
      }
      return proposed({ ...segBase, kind: 'report_delay', title: `Report ${label} as delayed to ${formatFriendlyTime(instant, zone)}`, detail: NOTIFY_DETAIL, newDepartureTime: instant.toISOString() })
    }

    case 'report_cancellation':
      return proposed({ ...segBase, kind: 'report_cancellation', title: `Report ${label} as cancelled`, detail: NOTIFY_DETAIL })

    case 'confirm_reschedule':
    case 'reject_reschedule': {
      const run = context.recentRuns.find(
        (r) => r.status === 'RESCHEDULING' && (r.segmentId === segment.id || r.pendingReschedule?.some((p) => p.segmentId === segment.id))
      )
      if (!run) return refuse(`There's no provider reply waiting for confirmation on ${label}.`)
      const pending = run.pendingReschedule?.find((p) => p.segmentId === segment.id) ?? run.pendingReschedule?.[0]
      const newTime = pending ? formatFriendlyTime(pending.requestedTime, resolveSegmentZones(context.segments.find((s) => s.id === pending.segmentId) ?? segment).departure) : null
      return proposed({
        ...segBase,
        kind: args.action,
        runId: run.id,
        title:
          args.action === 'confirm_reschedule'
            ? `Confirm the reschedule${pending ? ` — move ${pending.segmentLabel} to ${newTime}` : ''}`
            : "Tell Maestravl the provider's reply wasn't actually a yes",
        detail: args.action === 'confirm_reschedule' ? 'This updates your itinerary to the new time.' : 'Nothing in your itinerary changes; the reply stays open for you to handle.',
      })
    }

    case 'approve_contact':
    case 'decline_contact': {
      const approval = context.pendingApprovals.find((a) => a.segmentId === segment.id)
      if (!approval) return refuse(`Maestravl isn't waiting for an OK to contact anyone about ${label}.`)
      const what = approval.isFollowUp ? 'a follow-up' : "Maestravl's drafted message"
      return proposed({
        ...segBase,
        kind: args.action,
        runId: approval.runId,
        communicationId: approval.communicationId,
        title: args.action === 'approve_contact' ? `Send ${what} to ${approval.contactValue}` : `Don't send ${what} to ${approval.contactValue}`,
        detail: approval.subject ? `Subject: ${approval.subject}. You can read the full message on the trip page first.` : null,
      })
    }

    case 'check_status_now':
      if (!segment.monitoringActive) {
        return refuse(`${label} doesn't have live tracking (either its type isn't supported or monitoring is paused), so there's nothing to re-check.`)
      }
      return proposed({ ...segBase, kind: 'check_status_now', title: `Check ${label}'s live status now`, detail: 'Uses one live status lookup.' })

    case 'mark_resolved': {
      const run = context.recentRuns.find(
        (r) => (r.status === 'WAITING_FOR_RESPONSE' || r.status === 'ACTION_REQUIRED') && (r.segmentId === segment.id || r.actions.some((a) => a.segmentId === segment.id))
      )
      if (!run) return refuse(`Nothing about ${label} is waiting to be marked resolved.`)
      return proposed({ ...segBase, kind: 'mark_resolved', runId: run.id, title: `Mark the ${run.segmentLabel} issue as resolved`, detail: 'Maestravl stops waiting on the provider and closes this out.' })
    }

    case 'update_segment': {
      if (!args.field) return refuse('Ask which detail to change: seat, gate, terminal, confirmation number, or notes.')
      const apiField = EDITABLE_SEGMENT_FIELDS[args.field]
      const value = args.value?.trim() ?? ''
      const max = args.field === 'notes' ? 2000 : args.field === 'confirmation_number' ? 50 : 20
      if (value.length > max) return refuse(`That's too long for the ${args.field.replace('_', ' ')} (max ${max} characters).`)
      const fieldName = args.field.replace('_', ' ')
      const shown = value.length > 60 ? `${value.slice(0, 57)}…` : value
      return proposed({
        ...segBase,
        kind: 'update_segment',
        title: value ? `Set ${label}'s ${fieldName} to "${shown}"` : `Clear ${label}'s ${fieldName}`,
        segmentUpdate: { [apiField]: value || null },
      })
    }
  }
}

// --- read tools that need no network ----------------------------------

export function executeListTrips(account: VoiceAccountContext) {
  if (account.trips.length === 0) return { trips: [], message: 'The user has no trips yet.' }
  const home = account.homeTimezone
  const when = (d: Date | null) => (d ? formatFriendlyTime(d, home) : null)
  return {
    trips: account.trips.map((t) => ({
      title: t.title,
      status: t.status.toLowerCase(),
      starts: when(t.startsAt),
      ends: when(t.endsAt),
      segments: t.segmentCount,
      next: t.nextSegmentLabel ? `${t.nextSegmentLabel} at ${when(t.nextSegmentStartsAt)}` : null,
      isOpenOnScreen: t.id === account.pageTripId,
    })),
    timesShownIn: home ? `${friendlyZoneLabel(home)} (the user's home time)` : 'UTC — the user has no home time zone set',
  }
}

export function executeGetNeedsYou(account: VoiceAccountContext) {
  if (account.needsYou.length === 0) return { count: 0, message: 'Nothing is waiting on the user right now.' }
  return {
    count: account.needsYou.length,
    items: account.needsYou.map((n) => ({ trip: n.tripTitle, segment: n.segmentLabel, whatsNeeded: n.headline, detail: n.summary })),
    hint: 'They can answer these from the "Needs you" list on their dashboard, or ask you to prepare one.',
  }
}

export function executeCheckItinerary(context: VoiceContext) {
  const issues = checkItinerary(context.segments.map((s) => ({ ...s, label: segmentLabel(s) })))
  if (issues.length === 0) return { problemsFound: 0, message: 'No problems found in this itinerary.' }
  return { problemsFound: issues.length, problems: issues.map((i) => ({ severity: i.severity, message: i.message })) }
}

/** The IANA zone for a segment's destination end — the place "what time is it there" means. */
export function segmentZone(segment: VoiceSegment): string | null {
  const zones = resolveSegmentZones(segment)
  return zones.arrival ?? zones.departure
}

export function executeLocalTime(account: VoiceAccountContext, trip: VoiceContext | null, args: { place?: string; segment?: string }) {
  let zone: string | null = null
  let label = args.place ?? ''
  if (args.segment && trip) {
    const r = resolveSegment(trip.segments, args.segment, account.now)
    if (r.type === 'not_found') return notFoundResult(trip)
    if (r.type === 'ambiguous') return ambiguousResult(r.candidates)
    zone = segmentZone(r.segment)
    label = segmentLabel(r.segment)
  } else if (args.place) {
    const code = args.place.trim()
    const airport = code.length === 3 && /^[A-Za-z]+$/.test(code) ? lookupAirport(code) : null
    zone = airport?.timezone ?? zoneForPlaceName(args.place)
  } else {
    zone = account.homeTimezone
    label = 'home'
  }
  if (!zone) return { found: false, message: `I don't know the time zone for "${label}". Try a city with its own time zone, a country, or an airport code.` }
  return { found: true, place: label, ...localTimeReport(zone, account.homeTimezone, account.now) }
}

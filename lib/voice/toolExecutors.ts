// Pure — executes each of Claude's tool calls against an already-fetched
// VoiceContext (see lib/voice/tripContext.ts). No DB access happens here:
// the trip's data is small and trip-scoped, so it's fetched once per turn
// in the API route rather than once per tool call, keeping this whole
// module a plain synchronous fixture-testable function set.
import { segmentLabel } from '@/lib/segmentLabel'
import { STATUS_COPY, actionLabel } from '@/lib/agents/statusCopy'
import { computeManualDelayMinutes } from '@/lib/agents/computeManualDelay'
import { formatFriendlyTime, formatDuration } from '@/lib/dateFormat'
import { getFieldProfile } from '@/app/components/segmentFieldProfiles'
import { resolveSegment } from './resolveSegment'
import type { VoiceContext, VoiceSegment } from './types'

function describeSegment(segment: VoiceSegment) {
  return {
    label: segmentLabel(segment),
    transportType: segment.transportType,
    status: segment.status,
    departure:
      segment.departureLocation || segment.departureTime
        ? { location: segment.departureLocation, code: segment.departureLocationCode, time: segment.departureTime?.toISOString() ?? null }
        : null,
    arrival:
      segment.arrivalLocation || segment.arrivalTime
        ? { location: segment.arrivalLocation, code: segment.arrivalLocationCode, time: segment.arrivalTime?.toISOString() ?? null }
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

// --- Mutating-action propose logic ------------------------------------
//
// Each proposeX below is the pure "figure out exactly what would happen
// and describe it in plain speakable language" half of a two-call
// propose-then-confirm voice tool (see lib/voice/mutationExecutors.ts for
// the impure confirm-mode half that actually performs the mutation, using
// the same underlying functions the plain text UI already calls —
// lib/agents/detect.ts's handleDisruptionDetection, lib/monitoring/service.ts's
// runMonitoringCheck, lib/agents/confirmReschedule.ts's confirmReschedule).
// Never touches Prisma — same fixture-testable convention as the rest of
// this file. `frozenArgs` is exactly what gets sealed into a
// VoicePendingAction row and later handed, unmodified, to the real
// mutation — the model never has to reconstruct these values itself.

export type ProposeResult =
  | { ok: true; summary: string; frozenArgs: Record<string, unknown> }
  | { ok: false; found: false; message: string; availableSegments?: string[]; candidates?: string[] }
  | { ok: false; error: string }

export function proposeReportDelay(
  context: VoiceContext,
  args: { segment: string; status: 'DELAYED' | 'CANCELLED'; newDepartureTime?: string }
): ProposeResult {
  const result = resolveSegment(context.segments, args.segment, context.now)
  if (result.type === 'not_found') return { ok: false, ...notFoundResult(context) }
  if (result.type === 'ambiguous') return { ok: false, ...ambiguousResult(result.candidates) }
  const segment = result.segment
  const label = segmentLabel(segment)
  const timeLabel = getFieldProfile(segment.transportType).departureTimeLabel
  const timeLabelLower = timeLabel.charAt(0).toLowerCase() + timeLabel.slice(1)

  if (args.status === 'CANCELLED') {
    return {
      ok: true,
      summary: `Report ${label} as cancelled.`,
      frozenArgs: { segmentId: segment.id, status: 'CANCELLED' },
    }
  }

  if (!args.newDepartureTime) {
    return { ok: false, error: `I need the new ${timeLabelLower} to report a delay — what time does it say now?` }
  }
  const delay = computeManualDelayMinutes(segment.departureTime, args.newDepartureTime, timeLabelLower)
  if ('error' in delay) return { ok: false, error: delay.error }

  return {
    ok: true,
    summary: `Report ${label} delayed to ${formatFriendlyTime(new Date(args.newDepartureTime), segment.timezone)} — that's about ${formatDuration(delay.delayMinutes)} late.`,
    frozenArgs: { segmentId: segment.id, status: 'DELAYED', newDepartureTime: args.newDepartureTime },
  }
}

export function proposeCheckLiveStatus(context: VoiceContext, args: { segment: string }): ProposeResult {
  const result = resolveSegment(context.segments, args.segment, context.now)
  if (result.type === 'not_found') return { ok: false, ...notFoundResult(context) }
  if (result.type === 'ambiguous') return { ok: false, ...ambiguousResult(result.candidates) }
  const segment = result.segment

  return {
    ok: true,
    summary: `Check ${segmentLabel(segment)} with the live tracker right now — this uses up one of a limited number of checks.`,
    frozenArgs: { segmentId: segment.id },
  }
}

// A single RESCHEDULING run can carry more than one pending reschedule at
// once (confirmed live this session: one disrupted flight's recovery run
// asked for a new time on both a connecting flight AND a hotel
// simultaneously) — so what's actually confirmable is each *item*, not
// each run. Flattened here so "which one do you mean" candidates are the
// real per-segment labels, not the disrupted segment's own label repeated.
function pendingRescheduleItems(context: VoiceContext) {
  return context.recentRuns
    .filter((r) => r.status === 'RESCHEDULING')
    .flatMap((r) => (r.pendingReschedule ?? []).map((detail) => ({ runId: r.id, detail })))
}

export function proposeRespondToReschedule(context: VoiceContext, args: { segment?: string }): ProposeResult {
  let items = pendingRescheduleItems(context)

  if (args.segment) {
    const result = resolveSegment(context.segments, args.segment, context.now)
    if (result.type === 'not_found') return { ok: false, ...notFoundResult(context) }
    if (result.type === 'ambiguous') return { ok: false, ...ambiguousResult(result.candidates) }
    items = items.filter((item) => item.detail.segmentId === result.segment.id)
  }

  if (items.length === 0) {
    return { ok: false, error: "There's nothing waiting on your confirmation right now." }
  }
  if (items.length > 1) {
    return {
      ok: false,
      found: false,
      message: 'More than one reschedule is waiting on confirmation — ask the passenger which one they mean.',
      candidates: items.map((item) => item.detail.segmentLabel),
    }
  }

  const { runId, detail } = items[0]
  const feeText = detail.feeAmount ? `, with a fee of ${detail.currency ?? ''}${detail.feeAmount}`.trim() : ''
  return {
    ok: true,
    summary: `${detail.segmentLabel}'s provider offered to move it to ${formatFriendlyTime(detail.requestedTime, context.segments.find((s) => s.id === detail.segmentId)?.timezone ?? null)}${feeText} — should I accept or reject that?`,
    frozenArgs: { agentRunId: runId },
  }
}

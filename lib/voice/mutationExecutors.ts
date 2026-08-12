// Impure — the DB/network-touching counterpart to the pure proposeX
// functions in toolExecutors.ts (mirrors how lib/agents/orchestrator.ts
// wraps the pure lib/agents/analyze.ts). Handles both modes of each
// mutating voice tool:
//   - propose: run the pure logic, mint a VoicePendingAction row, return a
//     summary + confirmationToken. Nothing is mutated yet.
//   - confirm: verify the confirmationToken (lib/voice/pendingAction.ts —
//     right trip/tool, not expired, not already used, not confirmed within
//     the same turn it was proposed in), then perform the REAL mutation
//     using the exact same functions the plain text UI already calls.
// Every path returns an honest { status: 'proposed' | 'executed' | 'error', ... }
// — a thrown Prisma/network error is always caught and reported, never
// silently swallowed into a false "it worked."
import { prisma } from '@/lib/db'
import { handleDisruptionDetection } from '@/lib/agents/detect'
import { runMonitoringCheck } from '@/lib/monitoring/service'
import { confirmReschedule } from '@/lib/agents/confirmReschedule'
import { formatMonitoringStatus } from '@/lib/monitoring/format'
import { createPendingAction, consumePendingAction } from './pendingAction'
import { proposeReportDelay, proposeCheckLiveStatus, proposeRespondToReschedule } from './toolExecutors'
import type { VoiceContext } from './types'

export interface MutationMeta {
  tripId: string
  userId: string
  requestNonce: string
}

async function proposeAndMint(
  tool: 'report_delay' | 'check_live_status' | 'respond_to_reschedule',
  result: ReturnType<typeof proposeReportDelay>,
  meta: MutationMeta
): Promise<Record<string, unknown>> {
  if (!result.ok) return result
  const confirmationToken = await createPendingAction({
    tripId: meta.tripId,
    userId: meta.userId,
    tool,
    args: result.frozenArgs,
    requestNonce: meta.requestNonce,
  })
  return { status: 'proposed', summary: result.summary, confirmationToken, expiresInSeconds: 600 }
}

function confirmErrorMessage(reason: string): string {
  switch (reason) {
    case 'same_turn':
      return "I can't confirm that in the same breath I proposed it — I need the passenger's actual next reply first."
    case 'expired':
      return 'That confirmation has expired — ask the passenger again and propose it fresh.'
    case 'already_used':
      return 'That was already confirmed once — nothing more to do there.'
    case 'wrong_tool':
    case 'wrong_trip':
    case 'not_found':
    default:
      return "I couldn't find that confirmation — propose it again."
  }
}

export async function executeReportDelay(
  context: VoiceContext,
  args: { mode: 'propose' | 'confirm'; segment?: string; status?: 'DELAYED' | 'CANCELLED'; newDepartureTime?: string; confirmationToken?: string },
  meta: MutationMeta
): Promise<Record<string, unknown>> {
  if (args.mode === 'propose') {
    if (!args.segment || !args.status) return { status: 'error', error: 'Missing segment or status to propose a delay report.' }
    const result = proposeReportDelay(context, { segment: args.segment, status: args.status, newDepartureTime: args.newDepartureTime })
    return proposeAndMint('report_delay', result, meta)
  }

  if (!args.confirmationToken) return { status: 'error', error: 'No confirmation token given.' }
  const consumed = await consumePendingAction({
    confirmationToken: args.confirmationToken,
    tripId: meta.tripId,
    expectedTool: 'report_delay',
    currentRequestNonce: meta.requestNonce,
  })
  if (!consumed.ok) return { status: 'error', error: confirmErrorMessage(consumed.reason) }

  try {
    const segmentId = consumed.args.segmentId as string
    const status = consumed.args.status as 'DELAYED' | 'CANCELLED'
    const segment = await prisma.segment.findUnique({ where: { id: segmentId } })
    if (!segment || segment.tripId !== meta.tripId) return { status: 'error', error: 'That segment no longer exists on this trip.' }

    let delayMinutes: number | undefined
    if (status === 'DELAYED') {
      const newDepartureTime = consumed.args.newDepartureTime as string
      // Recompute fresh against the segment's *current* scheduled time —
      // never trust a copy frozen at propose time for the underlying math.
      delayMinutes = Math.round((new Date(newDepartureTime).getTime() - (segment.departureTime?.getTime() ?? 0)) / 60_000)
    }

    const disruption = await handleDisruptionDetection(segment, segment.status, {
      status,
      delayMinutes,
      checkedAt: new Date(),
      provider: 'voice-report',
    })

    return {
      status: 'executed',
      disruptionStarted: Boolean(disruption),
      message: disruption
        ? 'Reported and a recovery run has started.'
        : 'Reported, but not disruptive enough to start a recovery run.',
    }
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'Failed to report the delay.' }
  }
}

export async function executeCheckLiveStatus(
  context: VoiceContext,
  args: { mode: 'propose' | 'confirm'; segment?: string; confirmationToken?: string },
  meta: MutationMeta
): Promise<Record<string, unknown>> {
  if (args.mode === 'propose') {
    if (!args.segment) return { status: 'error', error: 'Missing segment to propose a status check.' }
    const result = proposeCheckLiveStatus(context, { segment: args.segment })
    return proposeAndMint('check_live_status', result, meta)
  }

  if (!args.confirmationToken) return { status: 'error', error: 'No confirmation token given.' }
  const consumed = await consumePendingAction({
    confirmationToken: args.confirmationToken,
    tripId: meta.tripId,
    expectedTool: 'check_live_status',
    currentRequestNonce: meta.requestNonce,
  })
  if (!consumed.ok) return { status: 'error', error: confirmErrorMessage(consumed.reason) }

  try {
    const segmentId = consumed.args.segmentId as string
    const segment = await prisma.segment.findUnique({ where: { id: segmentId } })
    if (!segment || segment.tripId !== meta.tripId) return { status: 'error', error: 'That segment no longer exists on this trip.' }

    const record = await runMonitoringCheck(segmentId)
    let liveStatus: string | null = null
    if (record.lastKnownData) {
      try {
        liveStatus = formatMonitoringStatus((JSON.parse(record.lastKnownData) as { status?: string }).status ?? 'UNKNOWN')
      } catch {
        liveStatus = null
      }
    }
    return { status: 'executed', liveStatus: liveStatus ?? 'unknown — the check did not return a usable status' }
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'Failed to check live status.' }
  }
}

export async function executeRespondToReschedule(
  context: VoiceContext,
  args: { mode: 'propose' | 'confirm'; segment?: string; accept?: boolean; confirmationToken?: string },
  meta: MutationMeta
): Promise<Record<string, unknown>> {
  if (args.mode === 'propose') {
    const result = proposeRespondToReschedule(context, { segment: args.segment })
    return proposeAndMint('respond_to_reschedule', result, meta)
  }

  if (!args.confirmationToken) return { status: 'error', error: 'No confirmation token given.' }
  if (typeof args.accept !== 'boolean') return { status: 'error', error: 'Missing accept/reject decision to confirm.' }
  const consumed = await consumePendingAction({
    confirmationToken: args.confirmationToken,
    tripId: meta.tripId,
    expectedTool: 'respond_to_reschedule',
    currentRequestNonce: meta.requestNonce,
  })
  if (!consumed.ok) return { status: 'error', error: confirmErrorMessage(consumed.reason) }

  try {
    const agentRunId = consumed.args.agentRunId as string
    const run = await prisma.agentRun.findUnique({ where: { id: agentRunId }, include: { trip: true } })
    if (!run || run.trip.id !== meta.tripId) return { status: 'error', error: 'That reschedule no longer exists on this trip.' }
    if (run.status !== 'RESCHEDULING') return { status: 'error', error: "That reschedule isn't waiting on a confirmation anymore." }

    const result = await confirmReschedule(agentRunId, args.accept)
    if (result.status === 'not_found') return { status: 'error', error: 'That reschedule no longer exists.' }
    if (result.status === 'not_pending') return { status: 'error', error: "That reschedule isn't waiting on a confirmation anymore." }

    return {
      status: 'executed',
      accepted: args.accept,
      message: args.accept ? "Accepted — the itinerary has been updated." : "Rejected — it's still open for you to look at.",
    }
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'Failed to respond to the reschedule.' }
  }
}

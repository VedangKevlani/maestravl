// Impure mutation body extracted from
// app/api/agent-runs/[id]/confirm-reschedule/route.ts so the voice
// assistant's respond_to_reschedule tool (lib/voice/mutationExecutors.ts)
// performs the *exact* same mutation the "Confirm — update itinerary" /
// "Not quite" buttons already do — not a second, potentially-drifting copy.
// The route itself becomes a thin auth/ownership + status-mapping wrapper
// around this. See that route's original header comment for why this is
// the one place a recovery run's own action is allowed to rewrite a
// Segment's scheduled time: gated behind an explicit human confirmation,
// the same trust boundary as a manual segment edit.
import { prisma } from '@/lib/db'
import { segmentLabel } from '@/lib/segmentLabel'
import type { AgentRun } from '@prisma/client'

export type ConfirmRescheduleResult =
  | { status: 'not_found' }
  | { status: 'not_pending' }
  | { status: 'rejected'; agentRun: AgentRun }
  | { status: 'confirmed'; agentRun: AgentRun }

export async function confirmReschedule(agentRunId: string, accept: boolean): Promise<ConfirmRescheduleResult> {
  const run = await prisma.agentRun.findUnique({ where: { id: agentRunId } })
  if (!run) return { status: 'not_found' }
  if (run.status !== 'RESCHEDULING') return { status: 'not_pending' }

  const pendingRequests = await prisma.rescheduleRequest.findMany({
    where: { agentRunId, status: 'REQUESTED' },
    include: { segment: true },
  })

  if (!accept) {
    await prisma.agentAction.create({
      data: {
        agentRunId,
        segmentId: null,
        type: 'VERIFY',
        riskLevel: 'LOW',
        status: 'EXECUTED',
        description: "You said the provider's reply didn't actually mean the reschedule was accepted — keeping this open.",
      },
    })
    const updated = await prisma.agentRun.update({
      where: { id: agentRunId },
      data: { status: 'ACTION_REQUIRED', summary: "Reply looked like a yes, but you said it wasn't — take another look." },
    })
    return { status: 'rejected', agentRun: updated }
  }

  for (const request of pendingRequests) {
    const segment = request.segment

    // A reply doesn't always accept the primary requested time — it might
    // accept the fallback alternative instead (see
    // lib/agents/inboundReply.ts, which marks whichever Alternative the
    // reply actually matched as `selected`). Apply that one when it exists;
    // only fall back to the plain requested time when no reply-driven
    // selection was ever recorded (e.g. this run was confirmed without
    // going through reply interpretation at all).
    const selectedAlternative = await prisma.alternative.findFirst({
      where: { agentRunId, segmentId: segment.id, selected: true },
    })
    const targetTime = selectedAlternative?.proposedTime ?? request.requestedTime
    const delta = segment.departureTime ? targetTime.getTime() - segment.departureTime.getTime() : null

    await prisma.segment.update({
      where: { id: segment.id },
      data: {
        departureTime: targetTime,
        arrivalTime: segment.arrivalTime && delta !== null ? new Date(segment.arrivalTime.getTime() + delta) : segment.arrivalTime,
        status: 'DELAYED',
      },
    })

    await prisma.rescheduleRequest.update({
      where: { id: request.id },
      data: { status: 'CONFIRMED', respondedAt: new Date() },
    })

    await prisma.agentAction.create({
      data: {
        agentRunId,
        segmentId: segment.id,
        type: 'UPDATE_ITINERARY',
        riskLevel: 'LOW',
        status: 'EXECUTED',
        description: `Updated ${segmentLabel(segment)}'s scheduled time to reflect the confirmed reschedule.`,
      },
    })
  }

  const updated = await prisma.agentRun.update({
    where: { id: agentRunId },
    data: { status: 'CONFIRMED', summary: 'Rescheduled and confirmed — your itinerary is up to date.', completedAt: new Date() },
  })
  return { status: 'confirmed', agentRun: updated }
}

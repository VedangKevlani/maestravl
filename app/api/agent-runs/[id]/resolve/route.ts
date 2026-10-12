import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'

// Manual "I heard back" action — spec section 12/14 territory: Maestravl
// reads email replies to its own requests (app/api/webhooks/resend-inbound),
// but a provider may answer by phone, text, or from a different email
// thread, so this is how a passenger closes the loop themselves when
// Maestravl has no way to know on its own. Deliberately AgentRun-level, not per-Communication — the
// passenger's mental model is "this got sorted," not "this specific
// message got a reply."
const RESOLVABLE_STATUSES = ['WAITING_FOR_RESPONSE', 'ACTION_REQUIRED']

const ResolveSchema = z.object({
  note: z.string().trim().max(1000).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id } = await params

  const run = await prisma.agentRun.findUnique({ where: { id }, include: { trip: true } })
  if (!run || run.trip.userId !== auth.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  // Same statuses BoardingPass offers "Heard back?" for. Without this a
  // stale tab or a double-submit could flip an already-finished run
  // (SUPERSEDED, CONFIRMED) back to CONFIRMED and log a duplicate action.
  if (!RESOLVABLE_STATUSES.includes(run.status)) {
    return NextResponse.json({ error: 'This update is already closed — refresh to see its latest status.' }, { status: 409 })
  }

  const json = await req.json().catch(() => null)
  const parsed = ResolveSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { note } = parsed.data

  // Claim the transition atomically before logging anything, so two
  // concurrent submits can't both pass the status check above.
  const claim = await prisma.agentRun.updateMany({
    where: { id, status: { in: RESOLVABLE_STATUSES } },
    data: {
      status: 'CONFIRMED',
      summary: note || "Marked resolved — you're all set.",
      completedAt: new Date(),
    },
  })
  if (claim.count === 0) {
    return NextResponse.json({ error: 'This update is already closed — refresh to see its latest status.' }, { status: 409 })
  }

  await prisma.communication.updateMany({
    where: { agentRunId: id, status: 'SENT' },
    data: { status: 'RESPONDED', respondedAt: new Date() },
  })

  await prisma.agentAction.create({
    data: {
      agentRunId: id,
      segmentId: null,
      type: 'VERIFY',
      riskLevel: 'LOW',
      status: 'EXECUTED',
      description: note ? `You confirmed: ${note}` : 'You marked this as resolved.',
    },
  })

  const updated = await prisma.agentRun.findUnique({ where: { id } })

  return NextResponse.json({ agentRun: updated })
}

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'

// Manual "I heard back" action — spec section 12/14 territory: Maestravl
// doesn't have real inbound-email parsing yet (see docs/ARCHITECTURE.md),
// so this is how a passenger closes the loop themselves when a provider
// actually replies by phone/text/email and Maestravl has no way to know
// on its own. Deliberately AgentRun-level, not per-Communication — the
// passenger's mental model is "this got sorted," not "this specific
// message got a reply."
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

  const json = await req.json().catch(() => null)
  const parsed = ResolveSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { note } = parsed.data

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

  const updated = await prisma.agentRun.update({
    where: { id },
    data: {
      status: 'CONFIRMED',
      summary: note || "Marked resolved — you're all set.",
      completedAt: new Date(),
    },
  })

  return NextResponse.json({ agentRun: updated })
}

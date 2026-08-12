import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'
import { confirmReschedule } from '@/lib/agents/confirmReschedule'

// Closes the loop after lib/agents/replyInterpretation.ts reads a provider's
// reply as a likely yes: the run sits in RESCHEDULING (never auto-CONFIRMED
// — spec section 20) until the passenger, having read the actual reply via
// GET .../communications, explicitly accepts or corrects the interpretation
// here. The actual mutation lives in lib/agents/confirmReschedule.ts, shared
// with the voice assistant's respond_to_reschedule tool — this route is
// just the HTTP auth/ownership wrapper around it.
const ConfirmSchema = z.object({ accept: z.boolean() })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id } = await params

  const run = await prisma.agentRun.findUnique({ where: { id }, include: { trip: true } })
  if (!run || run.trip.userId !== auth.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (run.status !== 'RESCHEDULING') {
    return NextResponse.json({ error: 'This run has no pending reschedule to confirm.' }, { status: 409 })
  }

  const json = await req.json().catch(() => null)
  const parsed = ConfirmSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const result = await confirmReschedule(id, parsed.data.accept)
  if (result.status === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (result.status === 'not_pending') {
    return NextResponse.json({ error: 'This run has no pending reschedule to confirm.' }, { status: 409 })
  }

  return NextResponse.json({ agentRun: result.agentRun })
}

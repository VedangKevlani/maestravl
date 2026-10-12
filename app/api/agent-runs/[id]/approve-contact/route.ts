import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'
import { approveContactRequest } from '@/lib/agents/approveContact'

// Closes the loop on the human-in-the-loop gate lib/agents/orchestrator.ts's
// draftContactRequest introduces: contacting a real provider always waits
// here first, never happens purely on Maestravl's own judgment. The actual
// send-or-decline lives in lib/agents/approveContact.ts, shared with
// nothing else yet (unlike confirm-reschedule, the voice assistant has no
// path to this either — same read-only boundary).
// contactId / customEmail let the passenger send to a different address
// than the one Contact Discovery picked (lib/agents/approveContact.ts
// validates a contactId belongs to the same segment).
const ApproveSchema = z.object({
  communicationId: z.string().min(1),
  approve: z.boolean(),
  contactId: z.string().min(1).optional(),
  customEmail: z.string().trim().toLowerCase().email('Enter a valid email address.').max(200).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id } = await params

  const run = await prisma.agentRun.findUnique({ where: { id }, include: { trip: true } })
  if (!run || run.trip.userId !== auth.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (run.status !== 'AWAITING_APPROVAL') {
    return NextResponse.json({ error: 'This run has no pending contact to approve.' }, { status: 409 })
  }

  const json = await req.json().catch(() => null)
  const parsed = ApproveSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { communicationId, approve, contactId, customEmail } = parsed.data
  const result = await approveContactRequest(id, communicationId, approve, { contactId, customEmail })
  if (result.status === 'invalid_contact') {
    return NextResponse.json({ error: "That address isn't one on file for this booking — pick another or type one in." }, { status: 400 })
  }
  if (result.status === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (result.status === 'not_pending') {
    return NextResponse.json({ error: 'This run has no pending contact to approve.' }, { status: 409 })
  }
  if (result.status === 'send_failed') {
    return NextResponse.json({ error: 'Could not send the request — try again.', agentRun: result.agentRun }, { status: 502 })
  }

  return NextResponse.json({ agentRun: result.agentRun })
}

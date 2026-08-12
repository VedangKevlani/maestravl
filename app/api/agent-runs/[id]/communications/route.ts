import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'

// Read-only view of the real Communication rows for a run — the actual
// email Maestravl sent to a provider, and the actual reply it got back, not
// just the paraphrased AgentAction.description a passenger otherwise sees.
// This is the first client-facing read of Communication content anywhere in
// the app; content is untrusted provider-supplied text and must always be
// rendered as plain text client-side, never as HTML.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id } = await params

  const run = await prisma.agentRun.findUnique({ where: { id }, include: { trip: true } })
  if (!run || run.trip.userId !== auth.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const communications = await prisma.communication.findMany({
    where: { agentRunId: id },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({
    communications: communications.map((c) => ({
      id: c.id,
      direction: c.direction,
      channel: c.channel,
      subject: c.subject,
      content: c.content,
      status: c.status,
      sentAt: c.sentAt,
      respondedAt: c.respondedAt,
      createdAt: c.createdAt,
    })),
  })
}

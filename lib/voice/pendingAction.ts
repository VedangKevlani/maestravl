// Impure — creates/verifies/consumes VoicePendingAction rows (see
// prisma/schema.prisma for why this exists: a voice "propose, then
// confirm" exchange needs its *exact* original parameters to survive the
// round-trip between two separate turns, not be re-derived from the
// model's memory of what it said). The client only ever holds and echoes
// back a row's opaque id — never inspects or reconstructs its contents.
import { prisma } from '@/lib/db'

export type PendingVoiceTool = 'report_delay' | 'check_live_status' | 'respond_to_reschedule'

const TTL_MS = 10 * 60 * 1000

export async function createPendingAction(opts: {
  tripId: string
  userId: string
  tool: PendingVoiceTool
  args: Record<string, unknown>
  requestNonce: string
}): Promise<string> {
  const row = await prisma.voicePendingAction.create({
    data: {
      tripId: opts.tripId,
      userId: opts.userId,
      tool: opts.tool,
      args: JSON.stringify(opts.args),
      requestNonce: opts.requestNonce,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  })
  return row.id
}

export type ConsumePendingActionResult =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; reason: 'not_found' | 'wrong_trip' | 'wrong_tool' | 'expired' | 'already_used' | 'same_turn' }

/**
 * Looks up a pending action by its (client-supplied, opaque) id and
 * verifies it's genuinely usable — right trip, right tool, not expired,
 * not already consumed, and — critically — not being confirmed within the
 * same runVoiceTurn call that proposed it (the tool-calling loop can
 * iterate several times per HTTP request; a same-turn confirm would mean
 * the model approved its own proposal with no real passenger reply ever
 * happening in between). Marks the row consumed on success so it can never
 * be reused, the same single-use guarantee a signed token's "used" check
 * would give, without any signing code.
 */
export async function consumePendingAction(opts: {
  confirmationToken: string
  tripId: string
  expectedTool: PendingVoiceTool
  currentRequestNonce: string
}): Promise<ConsumePendingActionResult> {
  const row = await prisma.voicePendingAction.findUnique({ where: { id: opts.confirmationToken } })
  if (!row) return { ok: false, reason: 'not_found' }
  if (row.tripId !== opts.tripId) return { ok: false, reason: 'wrong_trip' }
  if (row.tool !== opts.expectedTool) return { ok: false, reason: 'wrong_tool' }
  if (row.consumedAt) return { ok: false, reason: 'already_used' }
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' }
  if (row.requestNonce === opts.currentRequestNonce) return { ok: false, reason: 'same_turn' }

  await prisma.voicePendingAction.update({ where: { id: row.id }, data: { consumedAt: new Date() } })

  let args: Record<string, unknown>
  try {
    args = JSON.parse(row.args)
  } catch {
    args = {}
  }
  return { ok: true, args }
}

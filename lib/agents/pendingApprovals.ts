// Everything a passenger needs to make an informed call on a contact
// Maestravl wants to make on their behalf — shared by the boarding pass
// (app/(app)/trips/[id]/page.tsx) and the dashboard's "Needs you" inbox
// (lib/agents/needsYou.ts), so both show the same draft and the same
// choice of addresses.
//
// Before this, the approval prompt showed only "Reach out to <address>?" —
// the passenger approved an email to a real business without seeing what
// it said, or being able to pick a better address when Contact Discovery
// had found more than one.
import { prisma } from '@/lib/db'

export interface ContactOption {
  id: string
  value: string
  confidence: number
  source: string
}

export interface PendingContactApproval {
  communicationId: string
  segmentId: string
  contactValue: string
  channel: string
  confidence: number
  source: string
  /** The exact draft that will be sent on approval — shown before, never paraphrased. */
  subject: string | null
  content: string
  /** A nudge to a provider that hasn't replied yet (lib/agents/followUp.ts), not a first contact. */
  isFollowUp: boolean
  /** Other email addresses on file for this segment's provider the passenger can send to instead. */
  otherContacts: ContactOption[]
}

interface ActionLike {
  segmentId: string | null
  type: string
  status: string
  detail: string | null
  createdAt: Date
}

/**
 * Pure — the communication still waiting on the passenger's OK for one
 * segment: the latest CONTACT_PROVIDER action for it, if that action is
 * still REQUIRES_APPROVAL (lib/agents/orchestrator.ts's draftContactRequest
 * and lib/agents/followUp.ts write `communicationId` — and for a follow-up,
 * `followUpOf` — into its detail).
 */
export function pendingContactForSegment(actions: ActionLike[], segmentId: string): { communicationId: string; isFollowUp: boolean } | null {
  const latest = actions
    .filter((a) => a.segmentId === segmentId && a.type === 'CONTACT_PROVIDER')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
  if (!latest || latest.status !== 'REQUIRES_APPROVAL' || !latest.detail) return null
  try {
    const detail = JSON.parse(latest.detail) as { communicationId?: string; followUpOf?: string }
    return detail.communicationId ? { communicationId: detail.communicationId, isFollowUp: Boolean(detail.followUpOf) } : null
  } catch {
    return null
  }
}

/** Loads the full approval picture for each still-DRAFTED communication id given. */
export async function loadPendingApprovals(pending: { communicationId: string; isFollowUp: boolean }[]): Promise<Map<string, PendingContactApproval>> {
  if (pending.length === 0) return new Map()
  const communicationIds = pending.map((p) => p.communicationId)
  const followUpIds = new Set(pending.filter((p) => p.isFollowUp).map((p) => p.communicationId))
  const communications = await prisma.communication.findMany({
    where: { id: { in: communicationIds }, status: 'DRAFTED' },
    include: { contact: true },
  })
  const segmentIds = [...new Set(communications.map((c) => c.segmentId))]
  const contacts = await prisma.providerContact.findMany({
    where: { segmentId: { in: segmentIds }, channel: 'EMAIL' },
    orderBy: { confidence: 'desc' },
  })

  const result = new Map<string, PendingContactApproval>()
  for (const c of communications) {
    if (!c.contact) continue
    const seen = new Set([c.contact.value.toLowerCase()])
    const otherContacts: ContactOption[] = []
    for (const o of contacts) {
      if (o.segmentId !== c.segmentId || seen.has(o.value.toLowerCase())) continue
      seen.add(o.value.toLowerCase())
      otherContacts.push({ id: o.id, value: o.value, confidence: o.confidence, source: o.source })
    }
    result.set(c.id, {
      communicationId: c.id,
      segmentId: c.segmentId,
      contactValue: c.contact.value,
      channel: c.contact.channel,
      confidence: c.contact.confidence,
      source: c.contact.source,
      subject: c.subject,
      content: c.content,
      isFollowUp: followUpIds.has(c.id),
      otherContacts,
    })
  }
  return result
}

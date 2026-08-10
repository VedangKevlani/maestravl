// DB-touching half of the Contact Discovery Agent — wraps the pure
// extractors in lib/agents/contactDiscovery.ts. Checks for an
// already-discovered ProviderContact first (so a segment only ever gets
// looked up once, whether that lookup was free text extraction or a paid
// web search), then tries — in order — the segment's notes, its source
// document's extracted text, and finally a web search (only if configured
// and only if nothing local turned anything up), tagging each contact
// with which one it came from — spec section 5's "store the source and
// confidence of discovered contact information."
//
// Not unit tested directly (DB/network-touching, same convention as
// lib/monitoring/service.ts) — discoverContactsInText/discoverContactsInWebResults
// are what's tested.

import { prisma } from '@/lib/db'
import { discoverContactsInText, discoverContactsInWebResults } from './contactDiscovery'
import { searchWeb, isMinimaxSearchConfigured } from './minimaxSearch'
import type { ContactChannel, ContactSource } from '@/lib/constants'

// Below this, a discovered contact is recorded (for the audit trail / a
// human reviewing it later) but Maestravl won't message it automatically —
// spec section 5: "Do NOT use suspicious third-party contact details when
// an official source is available." A low-confidence match (a bare email
// with no "contact"/"reservations" keyword nearby, or a web result whose
// domain doesn't plausibly match the provider) might not be theirs at all.
export const MIN_AUTO_CONTACT_CONFIDENCE = 70

export interface ProviderContactRecord {
  id: string
  channel: ContactChannel
  value: string
  confidence: number
  source: ContactSource
}

function pickBest(contacts: ProviderContactRecord[]): ProviderContactRecord | null {
  if (contacts.length === 0) return null
  // EMAIL is the only channel this codebase can actually act on (see
  // lib/email.ts's sendProviderEmail) — prefer it even over a
  // higher-confidence phone/URL match, since we can't do anything with
  // those beyond informing the passenger they exist.
  const emailContacts = contacts.filter((c) => c.channel === 'EMAIL')
  const pool = emailContacts.length > 0 ? emailContacts : contacts
  return [...pool].sort((a, b) => b.confidence - a.confidence)[0]
}

export function isAutoContactable(contact: ProviderContactRecord | null): contact is ProviderContactRecord {
  return contact !== null && contact.channel === 'EMAIL' && contact.confidence >= MIN_AUTO_CONTACT_CONFIDENCE
}

async function persistAndPickBest(
  segmentId: string,
  candidates: { channel: ContactChannel; value: string; confidence: number; source: ContactSource }[]
): Promise<ProviderContactRecord | null> {
  if (candidates.length === 0) return null
  const created = await Promise.all(candidates.map((c) => prisma.providerContact.create({ data: { segmentId, ...c } })))
  return pickBest(
    created.map((c) => ({ id: c.id, channel: c.channel as ContactChannel, value: c.value, confidence: c.confidence, source: c.source as ContactSource }))
  )
}

function transportTypeLabel(transportType: string): string {
  return transportType.toLowerCase().replace(/_/g, ' ')
}

/**
 * Returns the best contact on file for a segment's provider, discovering
 * and persisting one if none exists yet — first from the segment's own
 * notes/source document, then (only if nothing local was found, a
 * provider name is known, and MINIMAX_API_KEY is configured) from a web
 * search. Returns null if nothing usable was ever on file and nothing
 * could be found anywhere — the caller (orchestrator) escalates to the
 * passenger in that case rather than guessing.
 */
export async function findOrDiscoverContact(segmentId: string): Promise<ProviderContactRecord | null> {
  const existing = await prisma.providerContact.findMany({ where: { segmentId } })
  if (existing.length > 0) {
    return pickBest(existing.map((c) => ({ id: c.id, channel: c.channel as ContactChannel, value: c.value, confidence: c.confidence, source: c.source as ContactSource })))
  }

  const segment = await prisma.segment.findUnique({
    where: { id: segmentId },
    include: { sourceDocument: true },
  })
  if (!segment) return null

  const localCandidates: { channel: ContactChannel; value: string; confidence: number; source: ContactSource }[] = []
  if (segment.notes) {
    for (const c of discoverContactsInText(segment.notes)) {
      localCandidates.push({ ...c, source: 'ITINERARY' })
    }
  }
  if (segment.sourceDocument?.extractedRawText) {
    for (const c of discoverContactsInText(segment.sourceDocument.extractedRawText)) {
      localCandidates.push({ ...c, source: 'BOOKING_CONFIRMATION' })
    }
  }
  if (localCandidates.length > 0) {
    return persistAndPickBest(segmentId, localCandidates)
  }

  if (!segment.provider || !isMinimaxSearchConfigured()) return null

  const query = `${segment.provider} ${transportTypeLabel(segment.transportType)} official contact email`
  const results = await searchWeb(query)
  if (results.length === 0) return null

  const webCandidates = discoverContactsInWebResults(results, segment.provider).map((c) => ({ ...c, source: 'WEB_LOOKUP' as ContactSource }))
  return persistAndPickBest(segmentId, webCandidates)
}

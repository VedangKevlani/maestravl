// Encodes/decodes the per-Communication reply address used to match an
// inbound email back to the outbound request it's replying to. Resend's
// inbound webhook (see app/api/webhooks/resend-inbound/route.ts) reports no
// reliable In-Reply-To/References threading headers, so this address *is*
// the correlation mechanism — every provider-facing email sets it as the
// Reply-To header (see lib/email.ts's sendProviderEmail), and a standard
// email client's "Reply" button addresses the response to it automatically.
//
// Pure string encode/decode, no I/O — unit-testable without a live domain
// or API key.

const LOCAL_PART_PREFIX = 'reply+'

/** Builds the address a specific Communication's replies should go to, or null if RESEND_INBOUND_DOMAIN isn't configured (inbound reply detection is off). */
export function buildReplyAddress(communicationId: string): string | null {
  const domain = process.env.RESEND_INBOUND_DOMAIN
  if (!domain) return null
  return `${LOCAL_PART_PREFIX}${communicationId}@${domain}`
}

/** Extracts the Communication id from a `to` address on an inbound email, or null if it doesn't match the expected format. */
export function parseCommunicationIdFromAddress(address: string): string | null {
  const at = address.indexOf('@')
  if (at === -1) return null
  const localPart = address.slice(0, at)
  if (!localPart.startsWith(LOCAL_PART_PREFIX)) return null
  const id = localPart.slice(LOCAL_PART_PREFIX.length)
  return id.length > 0 ? id : null
}

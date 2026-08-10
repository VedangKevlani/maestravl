// Contact Discovery Agent — spec section 5. "The itinerary should be the
// first source of contact information" — this module's primary job is
// pulling contact info out of text Maestravl already has: a segment's
// source document (the booking confirmation/itinerary PDF or photo that
// was OCR'd/parsed on upload) and its notes field. Only when that comes up
// empty does lib/agents/contact.ts fall back to a web search (see
// discoverContactsInWebResults below and lib/agents/minimaxSearch.ts for
// where the results actually come from) — and even then, a web result
// only gets auto-contactable confidence when its own domain plausibly
// matches the provider's name, per spec section 5's "do not use suspicious
// third-party contact details when an official source is available."
//
// Pure text-in, candidates-out — no DB or network access — so it's
// unit-testable without a database or a live API key, same convention as
// lib/agents/classify.ts.

import type { ContactChannel } from '@/lib/constants'

export interface DiscoveredContact {
  channel: ContactChannel
  value: string
  /** 0-100 — higher when the match sits near a phrase like "contact" or "reservations" rather than appearing bare in body text. */
  confidence: number
}

// Only channels this module can actually detect. WHATSAPP/PORTAL/SMS
// aren't distinguishable from a phone number or URL by text pattern alone
// — a phone number becomes 'OTHER' (informational only; nothing in this
// codebase can act on a bare phone number) rather than guessing it
// supports SMS/WhatsApp.
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/g
const PHONE_REGEX = /\+?\d[\d\s().-]{6,}\d/g

const CONTACT_KEYWORDS = [
  'contact', 'reservations', 'reservation', 'support', 'front desk',
  'customer service', 'inquiries', 'manage your booking', 'manage booking', 'help desk',
]

const PROXIMITY_WINDOW_CHARS = 60

function hasNearbyKeyword(text: string, matchIndex: number): boolean {
  const windowStart = Math.max(0, matchIndex - PROXIMITY_WINDOW_CHARS)
  const window = text.slice(windowStart, matchIndex).toLowerCase()
  return CONTACT_KEYWORDS.some((keyword) => window.includes(keyword))
}

/**
 * Scans raw text (a document's extracted text, a segment's notes, etc.)
 * for contact-like patterns. Confidence is higher when a match sits near a
 * contact-related keyword — a bare email in the middle of flight details
 * is more likely a passenger's own address than the provider's, so it
 * scores lower rather than being discarded outright (spec section 20:
 * surface uncertainty, don't silently drop data).
 */
export function discoverContactsInText(text: string): DiscoveredContact[] {
  const found: DiscoveredContact[] = []
  const seen = new Set<string>()

  for (const match of text.matchAll(EMAIL_REGEX)) {
    const value = match[0]
    const key = `EMAIL:${value.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    found.push({ channel: 'EMAIL', value, confidence: hasNearbyKeyword(text, match.index ?? 0) ? 85 : 60 })
  }

  for (const match of text.matchAll(URL_REGEX)) {
    const value = match[0].replace(/[.,;)\]]+$/, '')
    const key = `WEB_FORM:${value.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    found.push({ channel: 'WEB_FORM', value, confidence: hasNearbyKeyword(text, match.index ?? 0) ? 55 : 35 })
  }

  for (const match of text.matchAll(PHONE_REGEX)) {
    const raw = match[0].trim()
    const digits = raw.replace(/\D/g, '')
    if (digits.length < 7 || digits.length > 15) continue
    // Bare digit runs this length show up as prices, confirmation
    // numbers, etc. — only trust it as a phone number when it's either
    // explicitly international (+prefixed) or sits near a contact keyword.
    if (!raw.startsWith('+') && !hasNearbyKeyword(text, match.index ?? 0)) continue
    const key = `OTHER:${digits}`
    if (seen.has(key)) continue
    seen.add(key)
    found.push({ channel: 'OTHER', value: raw, confidence: hasNearbyKeyword(text, match.index ?? 0) ? 70 : 50 })
  }

  return found
}

export interface WebSearchResult {
  title: string
  url: string
  /** Plain-text snippet/body for this result, if the search provider returned one — some providers only return an opaque/encrypted blob here, in which case there's nothing to scan and only the URL itself is usable. */
  content: string
}

// Confidence floor/ceiling for a web-sourced contact depending on whether
// the result's own domain plausibly belongs to the provider. Matches
// lib/agents/contact.ts's MIN_AUTO_CONTACT_CONFIDENCE (70) — a name match
// clears it, a non-match never does, regardless of how the text itself
// scored (e.g. an email sitting right next to the word "contact" on some
// unrelated aggregator site is not an official source).
const OFFICIAL_DOMAIN_CONFIDENCE = 80
const UNVERIFIED_DOMAIN_MAX_CONFIDENCE = 45

function hostnameLikelyBelongsTo(url: string, providerName: string): boolean {
  const normalizedProvider = providerName.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (normalizedProvider.length < 3) return false
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase().replace(/[^a-z0-9.]/g, '')
    return hostname.includes(normalizedProvider)
  } catch {
    return false
  }
}

/**
 * Scores contacts found in web search results for one provider. Reuses
 * discoverContactsInText on each result's title+content, then rescales
 * confidence based on whether the result's domain looks like it actually
 * belongs to `providerName` — a real signal (if weak), not a fabricated
 * one. Also adds each result's own URL as a WEB_FORM candidate, since the
 * provider's website is itself a usable (if low-priority) contact channel
 * even when no email/phone was extracted from its text.
 */
export function discoverContactsInWebResults(results: WebSearchResult[], providerName: string): DiscoveredContact[] {
  const found: DiscoveredContact[] = []
  const seen = new Set<string>()

  for (const result of results) {
    const officialSignal = hostnameLikelyBelongsTo(result.url, providerName)

    for (const candidate of discoverContactsInText(`${result.title}\n${result.content}`)) {
      const key = `${candidate.channel}:${candidate.value.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      found.push({
        ...candidate,
        confidence: officialSignal
          ? Math.max(candidate.confidence, OFFICIAL_DOMAIN_CONFIDENCE)
          : Math.min(candidate.confidence, UNVERIFIED_DOMAIN_MAX_CONFIDENCE),
      })
    }

    const urlKey = `WEB_FORM:${result.url.toLowerCase()}`
    if (!seen.has(urlKey)) {
      seen.add(urlKey)
      found.push({ channel: 'WEB_FORM', value: result.url, confidence: officialSignal ? 65 : 30 })
    }
  }

  return found
}

// Pure text processing for inbound provider replies — extracting a plain
// readable message from whatever Resend hands back, and trimming the
// quoted thread history most email clients paste below a reply. Best
// effort, not a full email-parsing library: it catches the common cases
// (Gmail/Outlook-style "On ... wrote:" and "> "-prefixed quote blocks)
// but won't catch every client's quoting convention. Kept separate from
// lib/agents/inboundReply.ts (the DB-touching half) so it's unit-testable
// without a live webhook.

const QUOTE_HEADER_MARKERS = [/^On .+wrote:\s*$/m, /^-{2,}\s*Original Message\s*-{2,}\s*$/mi]

// A run of two or more consecutive '>'-quoted lines, anywhere in the text
// — top-posted replies place the new content above this, so cutting here
// keeps only what the person actually typed.
const QUOTE_BLOCK = /(^|\n)(>.*\n){2,}/

export function stripQuotedReply(text: string): string {
  let cutAt = text.length

  for (const marker of QUOTE_HEADER_MARKERS) {
    const match = marker.exec(text)
    if (match && match.index < cutAt) cutAt = match.index
  }

  const blockMatch = QUOTE_BLOCK.exec(text)
  if (blockMatch) {
    const index = blockMatch.index + (blockMatch[1] === '\n' ? 1 : 0)
    if (index < cutAt) cutAt = index
  }

  return text.slice(0, cutAt).trim()
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

const MAX_STORED_LENGTH = 5000
const MAX_SNIPPET_LENGTH = 220

/** Picks the best available plain-text version of an inbound email, strips quoted history, and caps its length for storage. */
export function extractReplyContent(email: { text: string | null; html: string | null }): string {
  const raw = email.text ?? (email.html ? htmlToPlainText(email.html) : '')
  const stripped = stripQuotedReply(raw) || raw.trim()
  return stripped.slice(0, MAX_STORED_LENGTH)
}

/** A short quote suitable for the live activity ticker — the full text is still stored via extractReplyContent, this is just what's shown inline. */
export function snippetOf(content: string): string {
  if (content.length <= MAX_SNIPPET_LENGTH) return content
  return `${content.slice(0, MAX_SNIPPET_LENGTH).trim()}…`
}

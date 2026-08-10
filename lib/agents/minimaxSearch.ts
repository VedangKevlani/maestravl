// MiniMax web_search Server Tool client — the fallback contact-lookup
// source when a segment's own itinerary/booking confirmation has no
// contact info (see lib/agents/contact.ts). Written against MiniMax's
// published Server Tools docs (https://platform.minimax.io/docs/guides/server-tools,
// checked Aug 2026), not a live-tested response — same honesty caveat as
// lib/monitoring/adapters/flight/aeroDataBox.ts carries for the same
// reason. If this is consistently returning nothing despite a valid key,
// log a raw response and check the field names below against what's
// actually coming back.
//
// This is NOT a plain keyword-search API — MiniMax's endpoint is
// Anthropic-Messages-API-compatible, and web_search is a "server tool" the
// model itself invokes mid-completion (same request/response shape as
// Anthropic's own `web_search_20250305` tool). A model call happens either
// way; there's no cheaper "just give me search results" mode.
//
// Cost: reported as ~$0.01/request as of this writing, but MiniMax's own
// docs page doesn't state pricing directly — confirm against your MiniMax
// dashboard before relying on the number. There's no per-segment cap
// beyond the natural one already in lib/agents/contact.ts: a segment only
// ever triggers this once, since a discovered contact (or the absence of
// one) is meant to be looked up once, not on every disruption.

const ENV_VAR = 'MINIMAX_API_KEY'
const MINIMAX_ENDPOINT = 'https://api.minimax.io/anthropic/v1/messages'
const MINIMAX_MODEL = 'MiniMax-M3'

export interface WebSearchResult {
  title: string
  url: string
  content: string
}

export function isMinimaxSearchConfigured(): boolean {
  return Boolean(process.env[ENV_VAR])
}

interface MinimaxContentBlock {
  type: string
  content?: unknown
}

interface MinimaxWebSearchResultItem {
  url?: string
  title?: string
  content?: string
  encrypted_content?: string
}

/**
 * Runs one web search via MiniMax's web_search server tool. Returns an
 * empty array on any failure (unconfigured, network error, non-2xx, or an
 * unrecognized response shape) rather than throwing — the caller treats
 * "no results" the same whether the search genuinely found nothing or
 * couldn't run at all, since either way there's nothing to act on. Never
 * fabricates a result.
 */
export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  const apiKey = process.env[ENV_VAR]
  if (!apiKey) return []

  let res: Response
  try {
    res = await fetch(MINIMAX_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MINIMAX_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: query }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      }),
    })
  } catch {
    return []
  }

  if (!res.ok) return []

  const body = await res.json().catch(() => null)
  const content: MinimaxContentBlock[] = Array.isArray(body?.content) ? body.content : []

  const results: WebSearchResult[] = []
  for (const block of content) {
    if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue
    for (const item of block.content as MinimaxWebSearchResultItem[]) {
      if (!item.url) continue
      results.push({
        title: item.title ?? '',
        url: item.url,
        // `encrypted_content` (if that's what comes back instead of plain
        // `content`) is opaque — nothing to scan, so this result only
        // contributes its URL as a candidate, not any extracted email/phone.
        content: typeof item.content === 'string' ? item.content : '',
      })
    }
  }
  return results
}

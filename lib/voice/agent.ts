// Impure — the only network call in this file is to the Groq API; the tool
// execution it drives (executeTool below) is a thin dispatch over the pure
// functions in toolExecutors.ts, which is what's actually unit tested. Not
// tested directly here, same convention as lib/agents/orchestrator.ts
// wrapping the pure lib/agents/analyze.ts.
//
// Uses Groq rather than Gemini: confirmed (Aug 2026) Groq's free tier needs
// no credit card and allows 14,400 requests/day (30/minute) — Gemini's free
// tier worked out to roughly 20 requests/day in practice for this workload,
// too tight for a voice UI used repeatedly in one session. Groq's API is
// OpenAI-compatible, called here via plain fetch (no SDK dependency, same
// convention as every other external integration in this codebase besides
// @google/genai and Resend/Supabase).
//
// Two models, not one, for the same reason as always: Groq's rate limits
// are tracked per model (independent buckets), so falling back from one to
// the other on ANY failure recovers from more failure modes than retrying
// the same model ever could.
//
// llama-3.3-70b-versatile (the original primary here, chosen 2026-08-13
// for its better free-tier TPM headroom) was retired from Groq entirely
// sometime after that — confirmed live (2026-09-05) it now 404s with
// "model_not_found" on every single call, not intermittently. Every real
// turn was silently paying for a doomed call before ever reaching the
// fallback, which for a question needing 2-3 tool-call rounds (e.g. "why
// is my flight delayed" — itinerary lookup, then status, then recovery
// activity) was enough extra latency/call volume on its own to tip into a
// timeout or the *fallback* model's own rate limit, something a single
// generic "Maestravl is having trouble" reply gave no way to tell apart
// from a genuine outage. gpt-oss-20b (same vendor/tool-call format as
// gpt-oss-120b, confirmed live to actually exist) replaces it — a real
// second bucket again, not a bug in this codebase's request shape.
//
// Deliberately read-only: there is no mutating tool anywhere in this file's
// tool loop. The voice assistant can describe what the passenger could do
// (report a delay, check live status, accept/reject a reschedule) but never
// performs it — see lib/voice/systemPrompt.ts for why, and toolExecutors.ts
// for confirmation there's no propose/confirm counterpart left to call.
import {
  VOICE_TOOLS,
  GetItineraryArgsSchema,
  GetSegmentStatusArgsSchema,
  GetRecoveryActivityArgsSchema,
} from './tools'
import { executeGetItinerary, executeGetSegmentStatus, executeGetRecoveryActivity } from './toolExecutors'
import { buildSystemPrompt } from './systemPrompt'
import { toSpeakableText } from './sanitizeSpeech'
import type { VoiceContext, VoiceTurnMessage } from './types'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const PRIMARY_MODEL = 'openai/gpt-oss-120b'
const FALLBACK_MODEL = 'openai/gpt-oss-20b'
// The model can batch every tool call it needs into one turn, so a normal
// exchange resolves in 1-2 iterations (a function-call round, then a final
// text round). This is a safety rail against a confused tool-call loop,
// not the expected case.
const MAX_TOOL_ITERATIONS = 4
const REQUEST_TIMEOUT_MS = 15000

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY)
}

function executeTool(name: string, rawArgs: unknown, context: VoiceContext): Record<string, unknown> {
  try {
    switch (name) {
      case 'get_itinerary':
        GetItineraryArgsSchema.parse(rawArgs)
        return executeGetItinerary(context)
      case 'get_segment_status':
        return executeGetSegmentStatus(context, GetSegmentStatusArgsSchema.parse(rawArgs))
      case 'get_recovery_activity':
        return executeGetRecoveryActivity(context, GetRecoveryActivityArgsSchema.parse(rawArgs))
      default:
        return { error: `Unknown tool: ${name}` }
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Invalid tool input' }
  }
}

// --- Minimal local types for Groq's OpenAI-compatible chat completions
// response — just what this file reads, not a full SDK surface.
interface GroqToolCall {
  id: string
  function: { name: string; arguments: string }
}
interface GroqMessage {
  role: string
  content: string | null
  tool_calls?: GroqToolCall[]
}
interface GroqChatCompletion {
  choices?: { message: GroqMessage }[]
}

type ChatMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string | null; tool_calls?: GroqToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string }

async function callGroqOnce(apiKey: string, model: string, messages: ChatMessage[]): Promise<GroqMessage> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      tools: VOICE_TOOLS.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
      tool_choice: 'auto',
      max_tokens: 1024,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => null) as { error?: { message?: string } } | null
    throw new Error(errBody?.error?.message ?? `Groq API responded ${res.status}`)
  }

  const data = (await res.json()) as GroqChatCompletion
  const message = data.choices?.[0]?.message
  if (!message) throw new Error('Groq API returned no message')
  return message
}

/** Tries PRIMARY_MODEL first; on any failure (malformed tool-call generation, rate limit, transient network error) falls back to FALLBACK_MODEL once. Since Groq tracks rate limits per model, this recovers from a rate-limited primary the same way it recovers from a malformed-generation primary — a same-model retry could only ever help with the latter. */
async function callGroq(apiKey: string, messages: ChatMessage[]): Promise<GroqMessage> {
  try {
    return await callGroqOnce(apiKey, PRIMARY_MODEL, messages)
  } catch {
    return callGroqOnce(apiKey, FALLBACK_MODEL, messages)
  }
}

export async function runVoiceTurn(opts: {
  context: VoiceContext
  history: VoiceTurnMessage[]
  transcript: string
}): Promise<{ replyText: string }> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured')

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(opts.context) },
    ...opts.history.map((m): ChatMessage => ({ role: m.role, content: m.content })),
    { role: 'user', content: opts.transcript },
  ]

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const message = await callGroq(apiKey, messages)

    if (!message.tool_calls || message.tool_calls.length === 0) {
      const text = message.content?.trim()
      return { replyText: toSpeakableText(text || "I'm here, but I didn't catch what to say — could you try again?") }
    }

    messages.push({ role: 'assistant', content: message.content, tool_calls: message.tool_calls })

    // Sequential, not Promise.all — these are synchronous pure functions
    // anyway, but kept in call order for the same reason the Gemini loop
    // was: the model rarely batches more than one call, and predictable
    // ordering makes a confused multi-call turn easier to debug.
    for (const call of message.tool_calls) {
      let args: unknown = {}
      try {
        // A no-arg call can come back as the literal string "null" (seen
        // live from gpt-oss-120b for get_itinerary, which takes no
        // arguments) — JSON.parse("null") legitimately yields the JS
        // value null, not {}, which would otherwise fail every no-arg
        // tool's z.object({}).strict() schema for no real reason.
        const parsed: unknown = call.function.arguments ? JSON.parse(call.function.arguments) : {}
        args = parsed ?? {}
      } catch {
        args = {}
      }
      const output = executeTool(call.function.name, args, opts.context)
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) })
    }
  }

  return { replyText: toSpeakableText("I've got a lot going on right now — could you ask that again in a moment?") }
}

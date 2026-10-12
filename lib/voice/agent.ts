// Impure — the Groq tool-calling loop. Tool decisions live in pure,
// unit-tested modules (toolExecutors.ts, aroundPure.ts); this file only
// dispatches to them, loads trips on demand, and calls the model.
//
// Uses Groq rather than Gemini: Groq's free tier needs no credit card;
// Gemini's worked out to roughly 20 requests/day in practice, too tight for
// a voice UI. Groq's API is OpenAI-compatible, called via plain fetch.
//
// Real free-tier limits (read from Groq's rate-limit headers, 2026-10-12 —
// earlier comments here said 14,400/day, which was wrong for these models):
// 1,000 requests/day and 8,000 tokens/minute, PER MODEL. A call carries
// ~2,800 prompt tokens (system prompt + tool schemas + history), and a
// multi-step turn makes ~3 calls. So:
// - calls alternate between the two models (callGroq), spreading
//   each turn across both per-model budgets instead of exhausting one;
// - on any failure the other model is tried once (separate rate-limit
//   bucket, so this also recovers from a rate-limited model);
// - app/api/voice caps turns per user, and tells the user how long to wait
//   when both models are spent.
// In practice that's a few multi-step questions per minute across the
// whole app — enough for an MVP; more needs a paid tier or a self-hosted
// model. (llama-3.3-70b-versatile, the original primary, was
// retired from Groq and 404'd on every call by 2026-09-05; gpt-oss-20b is
// the real second bucket now.)
//
// What the assistant may DO, and how it's bounded:
// - Read only the signed-in user's own trips: the account context lists
//   them, and a trip can only come into focus by resolving against that
//   list (resolveTrip), never from an id the model supplies.
// - navigate: moves the user between Maestravl's own pages (a fixed set of
//   routes built here, never a URL from the model). Changes no data, so it
//   runs without confirmation.
// - propose_action: returns a ProposedAction the chat shows as a card. The
//   user's tap runs it through the app's normal endpoints with their own
//   session, so the assistant can never do more than they could, and a
//   proposal only ever comes from that tool's validated output.
import {
  VOICE_TOOLS,
  ListTripsArgsSchema,
  GetNeedsYouArgsSchema,
  GetItineraryArgsSchema,
  GetSegmentStatusArgsSchema,
  GetRecoveryActivityArgsSchema,
  CheckItineraryArgsSchema,
  LocalTimeArgsSchema,
  WeatherArgsSchema,
  NearbyPlacesArgsSchema,
  ConvertCurrencyArgsSchema,
  NavigateArgsSchema,
  ProposeActionArgsSchema,
} from './tools'
import {
  executeGetItinerary,
  executeGetSegmentStatus,
  executeGetRecoveryActivity,
  executeProposeAction,
  executeListTrips,
  executeGetNeedsYou,
  executeCheckItinerary,
  executeLocalTime,
} from './toolExecutors'
import { executeWeather, executeNearbyPlaces, executeConvertCurrency } from './aroundTools'
import { resolveTrip } from './aroundPure'
import { buildSystemPrompt } from './systemPrompt'
import { toSpeakableText } from './sanitizeSpeech'
import type { Attribution } from './around'
import type { VoiceAccountContext, VoiceContext, VoiceTurnMessage, ProposedAction, NavigationTarget } from './types'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const PRIMARY_MODEL = 'openai/gpt-oss-120b'
const FALLBACK_MODEL = 'openai/gpt-oss-20b'
// A normal exchange resolves in 1-3 rounds (tool calls, then text); this is
// a safety rail against a confused tool-call loop, not the expected case.
const MAX_TOOL_ITERATIONS = 5
const REQUEST_TIMEOUT_MS = 15000

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY)
}

/** Per-turn state: who the user is, and the trips loaded so far this turn. */
export interface VoiceSession {
  account: VoiceAccountContext
  /** Loads one of the user's trips — only ever called with an id from account.trips. */
  loadTrip: (tripId: string) => Promise<VoiceContext>
}

interface TurnSink {
  proposal: ProposedAction | null
  navigation: NavigationTarget | null
  attributions: Map<string, Attribution>
}

/** The trip a tool call is about, or a result telling the model to ask. */
async function focusTrip(session: VoiceSession, tripArg: string | undefined, cache: Map<string, VoiceContext>): Promise<{ trip: VoiceContext } | { ask: Record<string, unknown> }> {
  const r = resolveTrip(session.account, tripArg)
  if (r.type === 'found') {
    if (!cache.has(r.trip.id)) cache.set(r.trip.id, await session.loadTrip(r.trip.id))
    return { trip: cache.get(r.trip.id)! }
  }
  const titles = (list: { title: string }[]) => list.map((t) => t.title)
  if (r.type === 'ambiguous') return { ask: { found: false, message: 'Several trips match — ask which one.', candidates: titles(r.candidates) } }
  if (r.type === 'not_found') return { ask: { found: false, message: `No trip matched "${tripArg}".`, trips: titles(session.account.trips) } }
  return { ask: { found: false, message: 'Ask which trip they mean.', trips: titles(r.candidates) } }
}

async function executeTool(name: string, rawArgs: unknown, session: VoiceSession, sink: TurnSink, cache: Map<string, VoiceContext>): Promise<Record<string, unknown>> {
  const withTrip = async (tripArg: string | undefined, fn: (trip: VoiceContext) => Record<string, unknown> | Promise<Record<string, unknown>>) => {
    const focus = await focusTrip(session, tripArg, cache)
    return 'ask' in focus ? focus.ask : fn(focus.trip)
  }
  const optionalTrip = async (tripArg: string | undefined, needed: boolean) => {
    if (!needed) return null
    const focus = await focusTrip(session, tripArg, cache)
    return 'trip' in focus ? focus.trip : null
  }
  const attribute = (list: Attribution[]) => list.forEach((a) => sink.attributions.set(a.url, a))

  try {
    switch (name) {
      case 'list_trips':
        ListTripsArgsSchema.parse(rawArgs)
        return executeListTrips(session.account)
      case 'get_needs_you':
        GetNeedsYouArgsSchema.parse(rawArgs)
        return executeGetNeedsYou(session.account)
      case 'get_itinerary': {
        const args = GetItineraryArgsSchema.parse(rawArgs)
        return withTrip(args.trip, (trip) => executeGetItinerary(trip))
      }
      case 'get_segment_status': {
        const args = GetSegmentStatusArgsSchema.parse(rawArgs)
        return withTrip(args.trip, (trip) => executeGetSegmentStatus(trip, args))
      }
      case 'get_recovery_activity': {
        const args = GetRecoveryActivityArgsSchema.parse(rawArgs)
        return withTrip(args.trip, (trip) => executeGetRecoveryActivity(trip, args))
      }
      case 'check_itinerary': {
        const args = CheckItineraryArgsSchema.parse(rawArgs)
        return withTrip(args.trip, (trip) => executeCheckItinerary(trip))
      }
      case 'local_time': {
        const args = LocalTimeArgsSchema.parse(rawArgs)
        return executeLocalTime(session.account, await optionalTrip(args.trip, Boolean(args.segment)), args)
      }
      case 'weather': {
        const args = WeatherArgsSchema.parse(rawArgs)
        const out = await executeWeather(session.account, await optionalTrip(args.trip, Boolean(args.segment)), args)
        attribute(out.attributions)
        return out.result
      }
      case 'nearby_places': {
        const args = NearbyPlacesArgsSchema.parse(rawArgs)
        const out = await executeNearbyPlaces(session.account, await optionalTrip(args.trip, Boolean(args.segment)), args)
        attribute(out.attributions)
        return out.result
      }
      case 'convert_currency': {
        const out = await executeConvertCurrency(ConvertCurrencyArgsSchema.parse(rawArgs))
        attribute(out.attributions)
        return out.result
      }
      case 'navigate': {
        const args = NavigateArgsSchema.parse(rawArgs)
        let target: NavigationTarget
        if (args.to === 'dashboard') target = { kind: 'dashboard', label: 'your dashboard' }
        else if (args.to === 'notifications') target = { kind: 'notifications', label: 'your notifications' }
        else {
          const focus = await focusTrip(session, args.trip, cache)
          if ('ask' in focus) return focus.ask
          target = { kind: args.to, tripId: focus.trip.trip.id, label: `${focus.trip.trip.title}${args.to === 'trip_map' ? ' on the map' : ''}` }
        }
        sink.navigation = target
        return { navigating: true, to: target.label, instruction: 'The page opens as you reply — say so briefly.' }
      }
      case 'propose_action': {
        const args = ProposeActionArgsSchema.parse(rawArgs)
        return withTrip(args.trip, (trip) => {
          const { result, proposal } = executeProposeAction(trip, args)
          if (proposal) sink.proposal = proposal
          return result
        })
      }
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
    const errBody = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(errBody?.error?.message ?? `Groq API responded ${res.status}`)
  }

  const data = (await res.json()) as GroqChatCompletion
  const message = data.choices?.[0]?.message
  if (!message) throw new Error('Groq API returned no message')
  return message
}

/** One model call, alternating which model goes first by round; on any failure tries the other once (separate rate-limit bucket). */
async function callGroq(apiKey: string, messages: ChatMessage[], round: number): Promise<GroqMessage> {
  // Alternate to spread each turn across both per-model token budgets (see
  // the header). Round 0 usually only picks tools; round 1 usually writes
  // the spoken answer — give that to the stronger model, which was seen live
  // to get place names right where the smaller one slipped ("Monte Carlo"
  // for Montego Bay).
  const [first, second] = round % 2 === 1 ? [PRIMARY_MODEL, FALLBACK_MODEL] : [FALLBACK_MODEL, PRIMARY_MODEL]
  try {
    return await callGroqOnce(apiKey, first, messages)
  } catch (err) {
    console.warn(`[voice] ${first} failed, trying ${second}:`, err instanceof Error ? err.message : err)
    return callGroqOnce(apiKey, second, messages)
  }
}

export interface VoiceTurnResult {
  replyText: string
  proposedAction: ProposedAction | null
  navigation: NavigationTarget | null
  attributions: Attribution[]
}

export async function runVoiceTurn(opts: { session: VoiceSession; history: VoiceTurnMessage[]; transcript: string }): Promise<VoiceTurnResult> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured')

  const cache = new Map<string, VoiceContext>()
  const sink: TurnSink = { proposal: null, navigation: null, attributions: new Map() }
  const pageTitle = opts.session.account.trips.find((t) => t.id === opts.session.account.pageTripId)?.title ?? null

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(opts.session.account, pageTitle) },
    ...opts.history.map((m): ChatMessage => ({ role: m.role, content: m.content })),
    { role: 'user', content: opts.transcript },
  ]
  const done = (text: string): VoiceTurnResult => ({
    replyText: toSpeakableText(text),
    proposedAction: sink.proposal,
    navigation: sink.navigation,
    attributions: [...sink.attributions.values()],
  })

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const message = await callGroq(apiKey, messages, i)

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return done(message.content?.trim() || "I'm here, but I didn't catch what to say — could you try again?")
    }

    messages.push({ role: 'assistant', content: message.content, tool_calls: message.tool_calls })

    // Sequential, in call order — predictable, and the trip cache means a
    // second tool on the same trip doesn't reload it.
    for (const call of message.tool_calls) {
      let args: unknown = {}
      try {
        // A no-arg call can come back as the literal string "null" (seen
        // live from gpt-oss-120b) — JSON.parse("null") is null, not {}.
        const parsed: unknown = call.function.arguments ? JSON.parse(call.function.arguments) : {}
        args = parsed ?? {}
      } catch {
        args = {}
      }
      const output = await executeTool(call.function.name, args, opts.session, sink, cache)
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) })
    }
  }

  return done("I've got a lot going on right now — could you ask that again in a moment?")
}

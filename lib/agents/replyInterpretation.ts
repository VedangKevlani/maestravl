// Interprets what a provider's reply actually means — the one deliberate
// exception to this codebase's "deterministic logic first, no LLM in the
// loop" rule (see lib/agents/analyze.ts, classify.ts, message.ts headers).
// Genuine language understanding is the actual job here, not
// classification a regex could do — matches the reasoning already used to
// justify Gemini for lib/voice/agent.ts, and reuses the same free-tier
// model rather than adding a new paid dependency.
//
// Split pure/impure the same way lib/agents/replyText.ts (pure) and
// lib/agents/inboundReply.ts (impure) already are: classifyReply is the
// only network call in this file; decideRunTransition is pure and is what
// actually decides what happens to the AgentRun, so the decision itself
// stays deterministic and unit-tested — only the reading-comprehension
// step is AI. classifyReply never throws: any failure (no key, timeout,
// malformed output) degrades to UNCLEAR, which is exactly today's
// behavior before this feature existed, so a broken classifier can never
// make anything worse than it already was.
import { GoogleGenAI } from '@google/genai'
import type { AgentRunStatus } from '@/lib/constants'
import { formatFriendlyTime } from '@/lib/dateFormat'

const MODEL = 'gemini-3.6-flash'
const REQUEST_TIMEOUT_MS = 15000
const ACCEPT_CONFIDENCE_THRESHOLD = 70
// gemini-3.6-flash spends tokens "thinking" before it emits the JSON
// response, and those thinking tokens count against maxOutputTokens —
// confirmed live (2026-08-12) that 256 was too tight: a real reply
// consumed ~198 thinking tokens alone, truncating the JSON before it
// closed and silently degrading every real classification to FALLBACK
// (this is why reply interpretation looked "broken" the first time a real
// provider reply was ever processed). 1024 leaves comfortable headroom.
const MAX_OUTPUT_TOKENS = 1024

export type ReplyIntent = 'ACCEPTED' | 'DECLINED' | 'COUNTER_OFFER' | 'UNCLEAR'
export type MatchedTime = 'PRIMARY' | 'ALTERNATIVE' | 'NONE'

export interface ReplyInterpretation {
  intent: ReplyIntent
  /** 0-100 — the model's own confidence, not independently verified. */
  confidence: number
  /** One short sentence explaining the read, shown alongside the raw reply, never in place of it. */
  note: string
  /**
   * Which of the two times Maestravl offered the reply actually accepted —
   * only meaningful when intent is ACCEPTED. Without this, an ACCEPTED read
   * has no way to tell "yes to the primary time" apart from "yes to the
   * fallback time", so confirm-reschedule would always apply the primary
   * time regardless of which one was actually agreed to (a real bug found
   * 2026-08-12: a real reply accepted the fallback and would have been
   * silently rescheduled to the wrong time).
   */
  matchedTime: MatchedTime
}

const FALLBACK: ReplyInterpretation = {
  intent: 'UNCLEAR',
  confidence: 0,
  note: 'Could not interpret this reply automatically — read it yourself below.',
  matchedTime: 'NONE',
}

export function isReplyInterpretationConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

export interface ClassifyReplyInput {
  replyText: string
  segmentLabel: string
  requestedTime: Date | null
  alternativeTime: Date | null
  timezone: string | null
}

/**
 * Classifies a provider's reply text against the reschedule request Maestravl
 * sent. Best-effort only — the caller must treat this as a hint, not a
 * verified fact (see decideRunTransition).
 */
export async function classifyReply(input: ClassifyReplyInput): Promise<ReplyInterpretation> {
  if (!isReplyInterpretationConfigured()) return FALLBACK

  try {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const requested = input.requestedTime ? formatFriendlyTime(input.requestedTime, input.timezone) : null
    const alternative = input.alternativeTime ? formatFriendlyTime(input.alternativeTime, input.timezone) : null

    const prompt = [
      `A passenger's trip-recovery assistant asked a travel provider (for "${input.segmentLabel}") to move a booking to a new time.`,
      requested ? `Primary requested time: ${requested}.` : null,
      alternative ? `Fallback alternative time offered: ${alternative}.` : null,
      `The provider replied:\n"""\n${input.replyText}\n"""`,
      'Classify what this reply means. Respond with only ONE of these words: ACCEPTED, DECLINED, COUNTER_OFFER, UNCLEAR.',
      'ACCEPTED = they agreed to the requested or alternative time. DECLINED = they said no with no other option offered. COUNTER_OFFER = they proposed a different time or need more information first. UNCLEAR = ambiguous, unrelated, or an auto-reply.',
      'confidence must be an INTEGER from 0 to 100 (not a 0-1 probability).',
      requested && alternative
        ? `matchedTime: only set when intent is ACCEPTED — "PRIMARY" if the time they agreed to is the primary requested time (${requested}), "ALTERNATIVE" if it's the fallback time (${alternative}) instead. Otherwise "NONE".`
        : 'matchedTime: always "NONE" (no primary/alternative pair was offered).',
    ].filter(Boolean).join('\n')

    const response = await client.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            intent: { type: 'STRING', enum: ['ACCEPTED', 'DECLINED', 'COUNTER_OFFER', 'UNCLEAR'] },
            confidence: { type: 'NUMBER', description: 'Integer 0-100, not a 0-1 probability' },
            note: { type: 'STRING' },
            matchedTime: { type: 'STRING', enum: ['PRIMARY', 'ALTERNATIVE', 'NONE'] },
          },
          required: ['intent', 'confidence', 'note', 'matchedTime'],
        },
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    })

    const text = response.text?.trim()
    if (!text) return FALLBACK

    const parsed = JSON.parse(text) as Partial<ReplyInterpretation>
    if (!parsed.intent || !['ACCEPTED', 'DECLINED', 'COUNTER_OFFER', 'UNCLEAR'].includes(parsed.intent)) {
      return FALLBACK
    }

    return {
      intent: parsed.intent,
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(100, parsed.confidence)) : 0,
      note: parsed.note?.trim() || FALLBACK.note,
      matchedTime: parsed.intent === 'ACCEPTED' && parsed.matchedTime === 'ALTERNATIVE' ? 'ALTERNATIVE' : parsed.intent === 'ACCEPTED' && parsed.matchedTime === 'PRIMARY' ? 'PRIMARY' : 'NONE',
    }
  } catch (err) {
    // Degrading to FALLBACK on any failure is deliberate (see header
    // comment) — but doing it silently meant a real timeout/network/parse
    // failure was indistinguishable from Gemini genuinely reading a reply
    // as ambiguous, with zero trace to tell them apart. Logged, not
    // swallowed, so a repeat of the 2026-09 intermittent-FALLBACK issue
    // (root cause: this route's own Vercel function duration, since fixed)
    // shows up in the function logs instead of just looking like a vague
    // reply.
    console.error('classifyReply failed, degrading to FALLBACK:', err instanceof Error ? err.message : err)
    return FALLBACK
  }
}

/**
 * Decides what an interpreted reply should do to the AgentRun. Pure and
 * deterministic on purpose: the language understanding already happened in
 * classifyReply, so what to *do* with that read stays as auditable and
 * testable as the rest of this codebase's decision logic. Never produces
 * CONFIRMED directly — spec section 20 (never claim a resolution that
 * wasn't verified) means even a confident ACCEPTED read only reaches
 * RESCHEDULING, a step that still requires the passenger's explicit
 * confirm before the itinerary actually changes (see
 * app/api/agent-runs/[id]/confirm-reschedule).
 */
export function decideRunTransition(
  interpretation: ReplyInterpretation,
  hasRescheduleRequest: boolean,
  segmentLabel: string
): { status: AgentRunStatus; summary: string } {
  if (interpretation.intent === 'ACCEPTED' && interpretation.confidence >= ACCEPT_CONFIDENCE_THRESHOLD && hasRescheduleRequest) {
    return {
      status: 'RESCHEDULING',
      summary: `${segmentLabel}'s provider's reply looks like a yes — read it and confirm to finish rescheduling.`,
    }
  }

  const flavor: Record<ReplyIntent, string> = {
    ACCEPTED: "looks like a yes — take a look at what they said.",
    DECLINED: "looks like they can't accommodate the new time — take a look at what they said.",
    COUNTER_OFFER: "looks like a counter-offer — take a look at what they said.",
    UNCLEAR: "take a look at what they said.",
  }

  return {
    status: 'ACTION_REQUIRED',
    summary: `${segmentLabel}'s provider replied — ${flavor[interpretation.intent]}`,
  }
}

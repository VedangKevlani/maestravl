import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'
import { isGroqConfigured, runVoiceTurn } from '@/lib/voice/agent'
import { loadVoiceContext } from '@/lib/voice/tripContext'
import { loadAccountContext } from '@/lib/voice/accountContext'
import { hitRateLimit, formatRetryAfter, VOICE_TURNS_PER_USER } from '@/lib/security/rateLimit'

// The assistant, on every page. Scoped to the signed-in user — their own
// trips only (lib/voice/agent.ts resolves any trip against the list loaded
// here). `tripId` is just the trip page they're on, if any: a default
// focus, re-checked for ownership, never trusted.
//
// Speech-to-text AND text-to-speech both happen in the browser (Kokoro —
// app/components/chat/useKokoro.ts); this route makes a few Groq calls and
// maybe a weather/places/rates lookup.
// 60s leaves headroom under Vercel's ceiling.
export const maxDuration = 60

const HistorySchema = z
  .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }))
  .max(12)

const BodySchema = z.object({
  transcript: z.string().trim().min(1).max(2000),
  history: HistorySchema.default([]),
  tripId: z.string().min(1).max(100).nullish(),
})

export async function POST(req: Request) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error

  if (!isGroqConfigured()) {
    return NextResponse.json({ error: 'The assistant is not configured on this deployment.' }, { status: 503 })
  }

  const json = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  // Every turn spends from one shared free Groq quota (and maybe a weather
  // or rates lookup) — a per-user cap keeps one account from exhausting it.
  const limit = await hitRateLimit(`voice:user:${auth.userId}`, VOICE_TURNS_PER_USER)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `You've asked a lot in a short time — please try again in ${formatRetryAfter(limit.retryAfterSeconds)}.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const requestedTrip = parsed.data.tripId
    ? await prisma.trip.findFirst({ where: { id: parsed.data.tripId, userId: auth.userId }, select: { id: true } })
    : null

  const account = await loadAccountContext(auth.userId, requestedTrip?.id ?? null)
  const ownTripIds = new Set(account.trips.map((t) => t.id))

  const turn = await runVoiceTurn({
    session: {
      account,
      loadTrip: async (tripId) => {
        // Defence in depth: resolveTrip only ever yields ids from this list.
        if (!ownTripIds.has(tripId)) throw new Error('Trip not found')
        return loadVoiceContext(tripId)
      },
    },
    history: parsed.data.history,
    transcript: parsed.data.transcript,
  }).catch((err) => {
    console.error('[voice] runVoiceTurn failed', err)
    // Groq's free tier allows 8,000 tokens/minute per model — when both are
    // spent, say how long to wait instead of a vague failure.
    const message = err instanceof Error ? err.message : ''
    const wait = message.match(/try again in ([\d.]+)s/i)
    const replyText = /rate limit/i.test(message)
      ? `I've hit my limit for the moment — give me about ${wait ? Math.ceil(Number(wait[1])) : 30} seconds and ask again.`
      : 'Maestravl is having trouble right now — please try again in a moment.'
    return { replyText, proposedAction: null, navigation: null, attributions: [] }
  })

  return NextResponse.json({
    reply: turn.replyText,
    // Prepared, not done — the chat shows it as a card and only the user's
    // tap runs it (app/components/chat/ProposedActionCard.tsx).
    proposedAction: turn.proposedAction,
    // An in-app page to open (no data changes). The client maps it to a route.
    navigation: turn.navigation,
    // Sources whose terms require credit (weather, places, rates, maps).
    attributions: turn.attributions,
  })
}

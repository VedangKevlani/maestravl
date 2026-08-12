import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'
import { isGeminiConfigured, runVoiceTurn } from '@/lib/voice/agent'
import { synthesizeSpeech } from '@/lib/voice/tts'
import { loadVoiceContext } from '@/lib/voice/tripContext'

// Speech-to-text now happens entirely client-side (the browser's own
// SpeechRecognition — see VoiceWidget.tsx), so this route only ever does a
// Gemini call plus an optional ElevenLabs call. Worst-case budget: up to
// two Gemini rounds (~15s each) + ElevenLabs (~10s) — comfortably under
// this with headroom. Vercel Hobby's default/max is 300s with Fluid
// Compute (confirmed against current docs), so this is generous but not
// wasteful relative to the platform ceiling.
export const maxDuration = 60

const HistorySchema = z
  .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }))
  .max(12)

// A pending mutating tool call (report a delay / check live status /
// respond to a reschedule) the passenger hasn't confirmed yet — see
// lib/voice/pendingAction.ts. The client only ever holds and echoes this
// back opaquely; size-capped defensively since it round-trips every turn.
const PendingActionSchema = z
  .object({
    toolName: z.string().max(100),
    toolArgs: z.record(z.string(), z.unknown()),
    toolResult: z.record(z.string(), z.unknown()),
  })
  .refine((v) => JSON.stringify(v).length <= 4000, 'pendingAction too large')

const BodySchema = z.object({
  transcript: z.string().trim().min(1).max(2000),
  history: HistorySchema.default([]),
  pendingAction: PendingActionSchema.nullable().default(null),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id: tripId } = await params

  const trip = await prisma.trip.findFirst({ where: { id: tripId, userId: auth.userId } })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  if (!isGeminiConfigured()) {
    return NextResponse.json({ error: 'The voice assistant is not configured on this deployment.' }, { status: 503 })
  }

  const json = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const context = await loadVoiceContext(tripId)
  const { replyText, pendingAction } = await runVoiceTurn({
    context,
    history: parsed.data.history,
    transcript: parsed.data.transcript,
    tripId,
    userId: auth.userId,
    pendingAction: parsed.data.pendingAction,
  }).catch(() => ({
    replyText: 'Maestravl is having trouble right now — please try again in a moment.',
    // Nothing was mutated if the call itself failed — safer to force a
    // fresh propose next time than to guess whether stale state still applies.
    pendingAction: null,
  }))

  const speech = await synthesizeSpeech(replyText)

  return NextResponse.json({
    reply: replyText,
    // null means: no server-synthesized audio for this turn (ElevenLabs
    // unconfigured or unavailable) — the widget speaks the reply itself
    // via the browser's own SpeechSynthesis instead.
    audio: speech ? { mimeType: speech.mimeType, base64: speech.audio.toString('base64') } : null,
    pendingAction,
  })
}

// Impure I/O side of text-to-speech. ElevenLabs only, and genuinely
// optional: on any failure (no key, quota exhausted, network error,
// non-2xx — a broad catch, matching lib/agents/minimaxSearch.ts's "never
// let an integration failure break the user-facing experience"
// convention) this returns null rather than throwing. The caller (the API
// route) treats null as "no server-synthesized audio for this turn" and
// the widget falls back to the browser's own SpeechSynthesis — a real
// browser API, not a third-party account, so there is no paid or
// trial-quota fallback anywhere in this pipeline.
const ELEVEN_KEY_VAR = 'ELEVENLABS_API_KEY'
const ELEVEN_VOICE_VAR = 'ELEVENLABS_VOICE_ID'
const REQUEST_TIMEOUT_MS = 10000

export interface SynthesizedSpeech {
  audio: Buffer
  mimeType: string
}

export function isElevenLabsConfigured(): boolean {
  return Boolean(process.env[ELEVEN_KEY_VAR] && process.env[ELEVEN_VOICE_VAR])
}

export async function synthesizeSpeech(text: string): Promise<SynthesizedSpeech | null> {
  const apiKey = process.env[ELEVEN_KEY_VAR]
  const voiceId = process.env[ELEVEN_VOICE_VAR]
  if (!apiKey || !voiceId) return null

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      // eleven_flash_v2_5: ElevenLabs' lowest-latency model (~75ms) — the
      // right tradeoff for a voice UI where round-trip time matters.
      body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      console.error(`[voice] ElevenLabs TTS responded ${res.status}; the widget will fall back to the browser's own voice`)
      return null
    }
    return { audio: Buffer.from(await res.arrayBuffer()), mimeType: 'audio/mpeg' }
  } catch (err) {
    console.error("[voice] ElevenLabs TTS request threw; the widget will fall back to the browser's own voice", err)
    return null
  }
}

'use client'
// Shared turn-sending logic for both VoiceWidget (single-turn, voice-only)
// and ChatPopup (persistent thread, voice + text). Straight lift of
// VoiceWidget's original sendTurn, generalized to accumulate a `messages`
// array instead of just the latest transcript/reply pair, so a thread view
// is possible. Both components call this same code so they can't drift
// apart in POST shape, history trimming, or the audio/TTS fallback chain.
import { useRef, useState } from 'react'
import type { VoiceTurnMessage } from '@/lib/voice/types'

const MAX_HISTORY = 12

export type TurnState = 'idle' | 'thinking' | 'speaking' | 'error'

export function useVoiceTurn(tripId: string) {
  const [state, setState] = useState<TurnState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [messages, setMessages] = useState<VoiceTurnMessage[]>([])
  const historyRef = useRef<VoiceTurnMessage[]>([])

  async function sendTurn(transcriptText: string) {
    setState('thinking')
    setMessages((m) => [...m, { role: 'user', content: transcriptText }])
    try {
      const res = await fetch(`/api/trips/${tripId}/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcriptText, history: historyRef.current }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setErrorMessage(data.error || 'Maestravl had trouble with that — try again?')
        setState('error')
        return
      }

      setMessages((m) => [...m, { role: 'assistant', content: data.reply }])
      // Nothing here ever writes to the trip (the voice assistant is
      // read-only — see lib/voice/systemPrompt.ts), so there's no server
      // state for the rest of the page to catch up on after a turn.
      const userTurn: VoiceTurnMessage = { role: 'user', content: transcriptText }
      const assistantTurn: VoiceTurnMessage = { role: 'assistant', content: data.reply }
      historyRef.current = [...historyRef.current, userTurn, assistantTurn].slice(-MAX_HISTORY)

      if (data.audio?.base64) {
        setState('speaking')
        const player = new Audio(`data:${data.audio.mimeType};base64,${data.audio.base64}`)
        player.onended = () => setState('idle')
        player.onerror = () => setState('idle')
        await player.play().catch(() => setState('idle'))
      } else if (typeof window !== 'undefined' && window.speechSynthesis) {
        // No server-synthesized audio for this turn (ElevenLabs unset or
        // unavailable) — speak it with the browser's own voice instead.
        setState('speaking')
        const utterance = new SpeechSynthesisUtterance(data.reply)
        utterance.onend = () => setState('idle')
        utterance.onerror = () => setState('idle')
        window.speechSynthesis.speak(utterance)
      } else {
        setState('idle')
      }
    } catch {
      setErrorMessage('Maestravl is having trouble connecting right now.')
      setState('error')
    }
  }

  return { state, errorMessage, messages, sendTurn }
}

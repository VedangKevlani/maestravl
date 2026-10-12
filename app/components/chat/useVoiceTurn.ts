'use client'
// Shared turn-sending logic for both VoiceWidget (single-turn, voice-only)
// and ChatPopup (persistent thread, voice + text), so the two can't drift
// apart in POST shape, history trimming, navigation, or the audio/TTS
// fallback chain.
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { VoiceTurnMessage, ProposedAction, NavigationTarget } from '@/lib/voice/types'
import { kokoroReady, preloadKokoro, recordVoiceDebug, speakWithKokoro, stopSpeaking, unlockAudio, voicePreference } from './useKokoro'

const MAX_HISTORY = 12

export type TurnState = 'idle' | 'thinking' | 'speaking' | 'error'

export interface Attribution {
  text: string
  url: string
}

/** A thread entry — an assistant turn may carry an action to confirm, and credits for the sources it used. */
export interface ChatTurn extends VoiceTurnMessage {
  proposedAction?: ProposedAction | null
  attributions?: Attribution[]
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/

/** The device's built-in voice — always available, used until Kokoro is ready or if it fails. */
function speakWithDevice(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return resolve()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    window.speechSynthesis.speak(utterance)
  })
}

/**
 * Maestravl's own routes only — built here from the target's kind, never a
 * URL from the server or the model.
 */
export function routeFor(target: NavigationTarget): string | null {
  switch (target.kind) {
    case 'dashboard':
      return '/dashboard'
    case 'notifications':
      return '/notifications'
    case 'trip':
      return SAFE_ID.test(target.tripId) ? `/trips/${target.tripId}` : null
    case 'trip_map':
      return SAFE_ID.test(target.tripId) ? `/trips/${target.tripId}/map` : null
    default:
      return null
  }
}

/** `pageTripId` is the trip page the user is on (if any) — the assistant's default focus. */
export function useVoiceTurn(pageTripId: string | null) {
  const router = useRouter()
  const [state, setState] = useState<TurnState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatTurn[]>([])
  const historyRef = useRef<VoiceTurnMessage[]>([])

  async function sendTurn(transcriptText: string) {
    // Called from the click/submit that started this turn — the moment the
    // browser allows audio to be unlocked. Also stops any reply still playing.
    unlockAudio()
    stopSpeaking()
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    setState('thinking')
    setErrorMessage(null)
    setMessages((m) => [...m, { role: 'user', content: transcriptText }])
    try {
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcriptText, history: historyRef.current, tripId: pageTripId }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setErrorMessage(data.error || 'Maestravl had trouble with that — try again?')
        setState('error')
        return
      }

      setMessages((m) => [...m, { role: 'assistant', content: data.reply, proposedAction: data.proposedAction ?? null, attributions: data.attributions ?? [] }])
      // A turn itself never writes data — at most it carries a proposal,
      // which only runs if the user taps Confirm on its card.
      const userTurn: VoiceTurnMessage = { role: 'user', content: transcriptText }
      const assistantTurn: VoiceTurnMessage = { role: 'assistant', content: data.reply }
      historyRef.current = [...historyRef.current, userTurn, assistantTurn].slice(-MAX_HISTORY)

      // "Open the map" etc. — the chat lives in the app layout, so the
      // conversation survives the page change.
      const route = data.navigation ? routeFor(data.navigation as NavigationTarget) : null
      if (route) router.push(route)

      // Kokoro (in-browser, natural voice) when it's wanted and loaded;
      // otherwise the device's own voice — and if Kokoro is wanted but not
      // loaded yet, start loading it so it takes over from the next reply.
      setState('speaking')
      recordVoiceDebug({ replyAt: Date.now(), engine: kokoroReady() ? 'kokoro' : 'device', chunks: 0 })
      if (kokoroReady()) {
        try {
          await speakWithKokoro(data.reply)
          setState('idle')
          return
        } catch {
          recordVoiceDebug({ engine: 'device', kokoroFailed: true })
          /* fall through to the device voice */
        }
      } else if (voicePreference() === 'natural') {
        preloadKokoro()
      }
      await speakWithDevice(data.reply)
      setState('idle')
    } catch {
      setErrorMessage('Maestravl is having trouble connecting right now.')
      setState('error')
    }
  }

  return { state, errorMessage, messages, sendTurn }
}

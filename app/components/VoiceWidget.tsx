'use client'
import { useEffect, useRef, useState } from 'react'
import type { VoiceTurnMessage } from '@/lib/voice/types'

// SpeechRecognition isn't in TypeScript's bundled DOM types (only its
// supporting types — SpeechRecognitionResultList etc. — are), and the
// constructor is still vendor-prefixed in some browsers. Minimal local
// types for exactly what's used here, rather than reaching for `any`.
interface SpeechRecognitionEventLike extends Event {
  results: SpeechRecognitionResultList
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type WidgetState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

const MAX_HISTORY = 12

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const SPEECH_ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': "Maestravl couldn't access your microphone.",
  'no-speech': "Didn't catch that — try again?",
  network: 'Maestravl is having trouble connecting right now.',
}

export default function VoiceWidget({ tripId }: { tripId: string }) {
  const [state, setState] = useState<WidgetState>('idle')
  const [supported, setSupported] = useState(true)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [reply, setReply] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const historyRef = useRef<VoiceTurnMessage[]>([])
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const capturedTranscriptRef = useRef<string>('')
  // onend's closure captures `state` as of when startListening() ran (always
  // 'idle'/'error'), not the live value after setState('listening') — a ref
  // sidesteps that stale-closure trap instead of comparing against `state`.
  const erroredRef = useRef(false)

  useEffect(() => {
    if (!getSpeechRecognitionConstructor()) setSupported(false)
  }, [])

  useEffect(
    () => () => {
      recognitionRef.current?.stop()
      window.speechSynthesis?.cancel()
    },
    []
  )

  async function sendTurn(transcriptText: string) {
    setState('thinking')
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

      setReply(data.reply)
      const userTurn: VoiceTurnMessage = { role: 'user', content: transcriptText }
      const assistantTurn: VoiceTurnMessage = { role: 'assistant', content: data.reply }
      historyRef.current = [...historyRef.current, userTurn, assistantTurn].slice(-MAX_HISTORY)

      if (data.audio?.base64) {
        setState('speaking')
        const player = new Audio(`data:${data.audio.mimeType};base64,${data.audio.base64}`)
        player.onended = () => setState('idle')
        player.onerror = () => setState('idle')
        await player.play().catch(() => setState('idle'))
      } else if (window.speechSynthesis) {
        // No server-synthesized audio for this turn (ElevenLabs unset or
        // unavailable) — speak it with the browser's own voice instead.
        // Genuinely free: a browser API, not a third-party account.
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

  function startListening() {
    if (state !== 'idle' && state !== 'error') return
    const Ctor = getSpeechRecognitionConstructor()
    if (!Ctor) return

    setErrorMessage(null)
    setTranscript(null)
    setReply(null)
    capturedTranscriptRef.current = ''
    erroredRef.current = false

    const recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (ev) => {
      let text = ''
      for (let i = 0; i < ev.results.length; i++) text += ev.results[i][0].transcript
      capturedTranscriptRef.current = text.trim()
    }
    recognition.onerror = (ev) => {
      erroredRef.current = true
      setErrorMessage(SPEECH_ERROR_MESSAGES[ev.error] ?? "Didn't catch that — try again?")
      setState('error')
    }
    recognition.onend = () => {
      if (erroredRef.current) return
      const text = capturedTranscriptRef.current
      if (text) {
        setTranscript(text)
        sendTurn(text)
      } else {
        setState('idle')
      }
    }

    recognitionRef.current = recognition
    recognition.start()
    setState('listening')
  }

  function stopListening() {
    if (state !== 'listening') return
    recognitionRef.current?.stop()
  }

  if (!supported) return null

  const label: Record<WidgetState, string> = {
    idle: 'Hold to talk to Maestravl',
    listening: 'Listening…',
    thinking: 'Thinking…',
    speaking: 'Speaking…',
    error: errorMessage ?? 'Something went wrong',
  }

  return (
    <div style={{ position: 'fixed', right: '1.5rem', bottom: '1.5rem', zIndex: 40 }} className="flex flex-col items-end gap-3">
      {(transcript || reply) && (
        <div className="glass-card p-4 flex flex-col gap-2" style={{ maxWidth: '20rem' }}>
          {transcript && (
            <p className="text-label text-white/40" style={{ fontSize: '0.65rem' }}>
              You said: <span className="text-white/60">{transcript}</span>
            </p>
          )}
          {reply && (
            <p className="text-editorial text-white/85" style={{ fontSize: '0.85rem' }}>
              {reply}
            </p>
          )}
        </div>
      )}

      <button
        onPointerDown={startListening}
        onPointerUp={stopListening}
        onPointerLeave={() => state === 'listening' && stopListening()}
        disabled={state === 'thinking' || state === 'speaking'}
        aria-label={label[state]}
        title={label[state]}
        className="glass-card rounded-full flex items-center justify-center disabled:opacity-60 select-none"
        style={{
          width: '3.25rem',
          height: '3.25rem',
          fontSize: '1.3rem',
          background: state === 'listening' ? 'rgba(229,72,77,0.18)' : undefined,
          border: state === 'listening' ? '1px solid rgba(229,72,77,0.4)' : undefined,
          touchAction: 'none',
        }}
      >
        {state === 'thinking' || state === 'speaking' ? '…' : '🎙'}
      </button>

      <p className="text-label text-white/35" style={{ fontSize: '0.6rem' }}>
        {label[state]}
      </p>
    </div>
  )
}

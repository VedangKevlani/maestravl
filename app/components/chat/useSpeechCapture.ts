'use client'
// Speech-recognition half of VoiceWidget, lifted out verbatim so ChatPopup's
// mic button and VoiceWidget's mic button share one implementation. Takes
// an onFinalTranscript callback — VoiceWidget and ChatPopup each pass their
// own useVoiceTurn's sendTurn.
import { useRef, useState } from 'react'

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

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const SPEECH_ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': "Maestro couldn't access your microphone.",
  'no-speech': "Didn't catch that — try again?",
  network: 'Maestro is having trouble connecting right now.',
}

export function useSpeechCapture(onFinalTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [supported] = useState(() => (typeof window !== 'undefined' ? !!getSpeechRecognitionConstructor() : true))
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const capturedTranscriptRef = useRef<string>('')
  // onend's closure captures `listening` as of when startListening() ran
  // (always false), not the live value after setListening(true) — a ref
  // sidesteps that stale-closure trap instead of comparing against state.
  const erroredRef = useRef(false)

  function startListening() {
    const Ctor = getSpeechRecognitionConstructor()
    if (!Ctor) return

    setErrorMessage(null)
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
      setListening(false)
    }
    recognition.onend = () => {
      setListening(false)
      if (erroredRef.current) return
      const text = capturedTranscriptRef.current
      if (text) onFinalTranscript(text)
    }

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  function stopListening() {
    recognitionRef.current?.stop()
  }

  return { supported, listening, errorMessage, startListening, stopListening }
}

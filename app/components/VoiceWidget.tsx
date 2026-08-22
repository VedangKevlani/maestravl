'use client'
import { Mic } from 'lucide-react'
import { useVoiceTurn } from './chat/useVoiceTurn'
import { useSpeechCapture } from './chat/useSpeechCapture'
import styles from '../styles/trip.module.css'

export default function VoiceWidget({ tripId }: { tripId: string }) {
  const { state, errorMessage, messages, sendTurn } = useVoiceTurn(tripId)
  const { listening, startListening, stopListening } = useSpeechCapture(sendTurn)

  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')

  const isThinking = state === 'thinking' || state === 'speaking'

  const label = listening
    ? 'Listening…'
    : state === 'thinking'
      ? 'Thinking…'
      : state === 'speaking'
        ? 'Speaking…'
        : state === 'error'
          ? errorMessage ?? 'Something went wrong'
          : 'Hold to talk to Maestro'

  return (
    <div className={styles.voiceWidget} data-tour="voice-widget">
      {/* Speech bubble — shown when there is a captured user transcript or a reply */}
      {(lastUser || lastAssistant) && (
        <div className={styles.voiceWidgetBubble}>
          {lastUser && (
            <div>
              <span className={styles.youSaidLabel}>
                YOU SAID{' '}
                <span className={styles.youSaidText}>{lastUser.content}</span>
              </span>
            </div>
          )}
          {lastAssistant && (
            <div className={styles.replyText}>{lastAssistant.content}</div>
          )}
        </div>
      )}

      {/* Mic button */}
      <button
        onPointerDown={startListening}
        onPointerUp={stopListening}
        onPointerLeave={() => listening && stopListening()}
        disabled={isThinking}
        aria-label={label}
        data-tip={label}
        className={`${styles.voiceWidgetBtn} ${listening ? styles.voiceWidgetBtnListening : ''}`}
      >
        {isThinking ? '…' : <Mic size={22} strokeWidth={2} />}
      </button>

      {/* Label */}
      <div className={styles.voiceWidgetLabel}>{label}</div>
    </div>
  )
}

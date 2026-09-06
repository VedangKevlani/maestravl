'use client'
import { Mic } from 'lucide-react'
import { useVoiceTurn } from './chat/useVoiceTurn'
import { useSpeechCapture } from './chat/useSpeechCapture'
import styles from '../styles/trip.module.css'

export default function VoiceWidget({ tripId }: { tripId: string }) {
  const { state, errorMessage, messages, sendTurn } = useVoiceTurn(tripId)
  const { supported, listening, toggleListening } = useSpeechCapture(sendTurn)

  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')

  const isThinking = state === 'thinking' || state === 'speaking'

  const label = !supported
    ? 'Voice input is not supported in this browser — try Chrome or Edge'
    : listening
      ? 'Listening… (click to stop)'
      : state === 'thinking'
        ? 'Thinking…'
        : state === 'speaking'
          ? 'Speaking…'
          : state === 'error'
            ? errorMessage ?? 'Something went wrong'
            : 'Click to talk to Maestro'

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
        onClick={toggleListening}
        disabled={isThinking || !supported}
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

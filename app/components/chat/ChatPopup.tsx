'use client'
// Floating "Chat with Maestro" popup, available on every page.
// Reads its own open/tripId state from ChatProvider (same pattern
// OnboardingOverlay uses for onboarding state) rather than taking props,
// so it can be mounted once at the (app) layout level and stay correct
// across client-side nav.
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { tripFromPath } from '../tripPath'
import { X, Mic, Send } from 'lucide-react'
import { UserTieIcon } from '../UserTieIcon'
import styles from '../../styles/chatPopup.module.css'
import { useChat } from './ChatProvider'
import { useVoiceTurn } from './useVoiceTurn'
import { useKokoro, setVoicePreference, preloadKokoro, unlockAudio } from './useKokoro'

/**
 * Natural voice (Kokoro, runs in this browser) vs the device's own voice.
 * Shows the one-time download's progress so a delay never looks broken.
 */
function VoiceSwitch() {
  const voice = useKokoro()
  // Chat opened with the natural voice wanted: start loading it now, so it's
  // ready by the time the first reply needs speaking.
  useEffect(() => {
    if (voice.preference === 'natural') preloadKokoro()
  }, [voice.preference])
  if (!voice.supported) return null

  const percent = Math.round(voice.progress * 100)
  const note =
    voice.preference !== 'natural'
      ? null
      : voice.status === 'loading'
        ? `Downloading natural voice… ${percent}% (one-time, about ${voice.approxDownloadMb} MB). Using your device's voice until it's ready.`
        : voice.status === 'error'
          ? "The natural voice couldn't load — using your device's voice."
          : voice.slow
            ? 'This device has no fast graphics support for the natural voice, so replies may take a while to start speaking.'
            : null

  return (
    <div style={{ padding: '8px 20px 0', fontSize: '11px', color: 'var(--muted)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} role="group" aria-label="Assistant voice">
        <span>Voice:</span>
        {(['natural', 'device'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={voice.preference === v}
            onClick={() => {
              unlockAudio()
              setVoicePreference(v)
            }}
            title={v === 'natural' ? `Kokoro — a natural voice that runs in your browser (one-time ~${voice.approxDownloadMb} MB download)` : "Your device's built-in voice"}
            className="rounded-full px-2 py-0.5"
            style={{
              border: '1px solid rgba(255,255,255,0.15)',
              background: voice.preference === v ? 'rgba(143,193,128,0.18)' : 'transparent',
              color: voice.preference === v ? '#cfe0c8' : 'inherit',
            }}
          >
            {v === 'natural' ? 'Natural' : 'Device'}
          </button>
        ))}
      </div>
      {note && (
        <p role="status" style={{ marginTop: 4 }}>
          {note}
        </p>
      )}
    </div>
  )
}
import { useSpeechCapture } from './useSpeechCapture'
import { ChatBubble } from './ChatBubble'
import ProposedActionCard from './ProposedActionCard'
import { useDraggable } from './useDraggable'

export default function ChatPopup() {
  const { open, close } = useChat()
  // The trip page you're on is the assistant's default focus; anywhere
  // else it works across all your trips.
  const { tripId } = tripFromPath(usePathname())
  if (!open) return null
  return <ChatPopupInner tripId={tripId} onClose={close} />
}

const SUGGESTIONS_ON_TRIP = ["What's next on this trip?", "What's the weather where I'm going?", 'Anything wrong with my itinerary?', 'Open the map']
const SUGGESTIONS_ANYWHERE = ['What needs my attention?', "When's my next trip?", 'What time is it in Jamaica?', 'Convert 100 USD to JMD']

function ChatPopupInner({ tripId, onClose }: { tripId: string | null; onClose: () => void }) {
  const { state, errorMessage, messages, sendTurn } = useVoiceTurn(tripId)
  const [inputValue, setInputValue] = useState('')
  const popupRef = useRef<HTMLDivElement>(null)
  const { position, dragHandleProps } = useDraggable(popupRef)

  const { supported: micSupported, listening, toggleListening } = useSpeechCapture((text) => {
    sendTurn(text)
  })

  function submitText() {
    const text = inputValue.trim()
    if (!text || state === 'thinking' || state === 'speaking') return
    setInputValue('')
    sendTurn(text)
  }

  const subheading = listening ? 'Listening…' : state === 'thinking' ? 'Thinking…' : state === 'speaking' ? 'Speaking…' : state === 'error' ? errorMessage ?? 'Something went wrong' : null

  return (
    <div
      ref={popupRef}
      className={styles.popup}
      style={position ? { top: position.top, left: position.left, right: 'auto', bottom: 'auto' } : undefined}
    >
      <div className={styles.drag} style={{ touchAction: 'none', cursor: 'grab' }} {...dragHandleProps}>
        <div className={styles.avatar}><UserTieIcon size={14} strokeWidth={2} /></div>
        <div className={styles.headingWrap}>
          <div className={styles.heading}>Chat with Maestro</div>
          {subheading && <div className={styles.subheading}>{subheading}</div>}
        </div>
        <button type="button" className={styles.closeBtn} aria-label="Close chat" onClick={onClose}>
          <X size={15} />
        </button>
      </div>

      <VoiceSwitch />

      <div className={styles.body}>
        {messages.length === 0 ? (
          <div>
            <p className={styles.empty}>
              {tripId
                ? 'Ask about this trip, any of your other trips, or the places you’re going.'
                : 'Ask about your trips, what needs your attention, or the places you’re going.'}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {(tripId ? SUGGESTIONS_ON_TRIP : SUGGESTIONS_ANYWHERE).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="rounded-full px-2.5 py-1 text-white/70 hover:text-white"
                  style={{ fontSize: '11.5px', border: '1px solid rgba(255,255,255,0.15)' }}
                  disabled={state === 'thinking' || state === 'speaking'}
                  onClick={() => sendTurn(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className="flex flex-col gap-2">
              <ChatBubble role={m.role} content={m.content} />
              {m.proposedAction && <ProposedActionCard action={m.proposedAction} />}
              {m.attributions && m.attributions.length > 0 && (
                <p className="text-white/35" style={{ fontSize: '10.5px' }}>
                  {m.attributions.map((a, j) => (
                    <span key={a.url}>
                      {j > 0 && ' · '}
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-white/60">{a.text}</a>
                    </span>
                  ))}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      <div className={styles.inputRow}>
        <button
          type="button"
          className={`${styles.micBtn} ${listening ? styles.listening : ''}`}
          aria-label={!micSupported ? 'Voice input is not supported in this browser — try Chrome or Edge' : listening ? 'Stop listening' : 'Click to speak to Maestro'}
          title={!micSupported ? 'Voice input is not supported in this browser — try Chrome or Edge' : listening ? 'Stop listening' : 'Click to speak to Maestro'}
          disabled={!micSupported || state === 'thinking' || state === 'speaking'}
          onClick={() => { unlockAudio(); toggleListening() }}
        >
          <Mic size={14} />
        </button>
        <input
          type="text"
          className={styles.textInput}
          placeholder="Message Maestro…"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitText()
          }}
          disabled={state === 'thinking' || state === 'speaking'}
        />
        <button
          type="button"
          className={styles.sendBtn}
          aria-label="Send message"
          title="Send message"
          onClick={submitText}
          disabled={!inputValue.trim() || state === 'thinking' || state === 'speaking'}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}

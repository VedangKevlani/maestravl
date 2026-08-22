'use client'
// Floating "Chat with Maestro" popup — ported from modals/chat/chat-popup.*.
// Reads its own open/tripId state from ChatProvider (same pattern
// OnboardingOverlay uses for onboarding state) rather than taking props,
// so it can be mounted once at the (app) layout level and stay correct
// across client-side nav.
import { useRef, useState } from 'react'
import { X, Mic, Send, UserRound } from 'lucide-react'
import styles from '../../styles/chatPopup.module.css'
import { useChat } from './ChatProvider'
import { useVoiceTurn } from './useVoiceTurn'
import { useSpeechCapture } from './useSpeechCapture'
import { ChatBubble } from './ChatBubble'
import { useDraggable } from './useDraggable'

export default function ChatPopup() {
  const { open, tripId, close } = useChat()

  // tripId is only null before a trip page has ever opened the popup —
  // once open is true, ChatProvider.toggle always supplied a tripId, so
  // this early return is the only place that matters.
  if (!open || !tripId) return null

  return <ChatPopupInner tripId={tripId} onClose={close} />
}

function ChatPopupInner({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const { state, errorMessage, messages, sendTurn } = useVoiceTurn(tripId)
  const [inputValue, setInputValue] = useState('')
  const popupRef = useRef<HTMLDivElement>(null)
  const { position, dragHandleProps } = useDraggable(popupRef)

  const { supported: micSupported, listening, startListening, stopListening } = useSpeechCapture((text) => {
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
        <div className={styles.avatar}><UserRound size={14} strokeWidth={2} /></div>
        <div className={styles.headingWrap}>
          <div className={styles.heading}>Chat with Maestro</div>
          {subheading && <div className={styles.subheading}>{subheading}</div>}
        </div>
        <button type="button" className={styles.closeBtn} aria-label="Close chat" onClick={onClose}>
          <X size={15} />
        </button>
      </div>

      <div className={styles.body}>
        {messages.length === 0 ? (
          <p className={styles.empty}>Ask Maestro anything about this trip.</p>
        ) : (
          messages.map((m, i) => <ChatBubble key={i} role={m.role} content={m.content} />)
        )}
      </div>

      <div className={styles.inputRow}>
        <button
          type="button"
          className={`${styles.micBtn} ${listening ? styles.listening : ''}`}
          aria-label={listening ? 'Stop listening' : 'Hold to speak to Maestro'}
          title={listening ? 'Stop listening' : 'Hold to speak to Maestro'}
          disabled={state === 'thinking' || state === 'speaking'}
          onPointerDown={startListening}
          onPointerUp={stopListening}
          onPointerLeave={() => listening && stopListening()}
          style={{ touchAction: 'none' }}
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

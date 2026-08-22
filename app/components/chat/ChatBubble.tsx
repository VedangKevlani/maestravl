// Shared bubble so a reply looks identical whether it came from
// VoiceWidget's single-turn display or ChatPopup's thread view.
export function ChatBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  return (
    <div className={role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className="glass-card p-3"
        style={{
          maxWidth: '85%',
          background: role === 'user' ? 'rgba(255,255,255,0.08)' : undefined,
        }}
      >
        <p className="text-editorial text-white/85" style={{ fontSize: '0.85rem' }}>
          {content}
        </p>
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PendingContactApproval } from '@/lib/agents/pendingApprovals'
import styles from '../styles/trip.module.css'

const SOURCE_LABEL: Record<string, string> = {
  ITINERARY: 'your itinerary notes',
  BOOKING_CONFIRMATION: 'your booking confirmation',
  WEB_LOOKUP: 'a web search',
  MANUAL: 'an address you entered',
}

/**
 * The passenger's decision point before Maestravl emails a real business on
 * their behalf — used on the boarding pass and in the dashboard's "Needs
 * you" inbox, so the gate looks and behaves the same everywhere. Shows the
 * exact draft that will be sent (not a paraphrase), and lets the passenger
 * send it somewhere else when Contact Discovery's pick looks wrong. Nothing
 * is sent until "Yes, send it" — the server enforces that too
 * (lib/agents/approveContact.ts).
 */
export default function ContactApprovalCard({ runId, approval, label }: { runId: string; approval: PendingContactApproval; label?: string }) {
  const router = useRouter()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [choosing, setChoosing] = useState(false)
  // 'current' | a ProviderContact id | 'custom'
  const [choice, setChoice] = useState<string>('current')
  const [customEmail, setCustomEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chosenAddress =
    choice === 'current'
      ? approval.contactValue
      : choice === 'custom'
        ? customEmail.trim()
        : approval.otherContacts.find((c) => c.id === choice)?.value ?? approval.contactValue

  async function decide(approve: boolean) {
    setError(null)
    if (approve && choice === 'custom' && !/^\S+@\S+\.\S+$/.test(customEmail.trim())) {
      setError('Enter the email address to send this to.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/agent-runs/${runId}/approve-contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communicationId: approval.communicationId,
          approve,
          ...(approve && choice === 'custom' ? { customEmail: customEmail.trim() } : {}),
          ...(approve && choice !== 'current' && choice !== 'custom' ? { contactId: choice } : {}),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || (approve ? "The message couldn't be sent — reach out to the provider directly." : "Couldn't save your answer — try again."))
      }
    } catch {
      setError("Couldn't reach Maestravl — check your connection and try again.")
    } finally {
      setBusy(false)
      router.refresh()
    }
  }

  const where = SOURCE_LABEL[approval.source] ?? approval.source.toLowerCase().replace('_', ' ')

  return (
    <div className="flex flex-col gap-2">
      <p className={styles.runRibbonNote}>
        {approval.isFollowUp ? (
          <>
            {label ? `${label}: ` : ''}No reply yet to Maestravl&rsquo;s request. Send <strong>{chosenAddress}</strong> a short follow-up?
          </>
        ) : (
          <>
            {label ? `${label}: ` : ''}Found <strong>{chosenAddress}</strong>
            {choice === 'current' ? ` in ${where} (confidence ${approval.confidence})` : ''}. Send them this message on your behalf?
          </>
        )}
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" className={styles.linkBtn} onClick={() => setPreviewOpen((v) => !v)} aria-expanded={previewOpen}>
          {previewOpen ? 'Hide message' : 'See the exact message'}
        </button>
        <button type="button" className={styles.linkBtn} onClick={() => setChoosing((v) => !v)} aria-expanded={choosing}>
          {choosing ? 'Keep this address' : approval.otherContacts.length > 0 ? `Send to a different address (${approval.otherContacts.length} more on file)` : 'Send to a different address'}
        </button>
      </div>

      {previewOpen && (
        <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
          {approval.subject && (
            <p className="text-editorial text-white/80 font-medium mb-1" style={{ fontSize: '0.78rem' }}>{approval.subject}</p>
          )}
          {/* Plain text only — never rendered as HTML. */}
          <p className="text-editorial text-white/60 whitespace-pre-wrap" style={{ fontSize: '0.78rem', lineHeight: 1.55 }}>{approval.content}</p>
        </div>
      )}

      {choosing && (
        <fieldset className="flex flex-col gap-1.5" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr-only">Who should Maestravl send this to?</legend>
          {[{ id: 'current', value: approval.contactValue, confidence: approval.confidence, source: approval.source }, ...approval.otherContacts].map((c) => (
            <label key={c.id} className="flex items-center gap-2" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)' }}>
              <input type="radio" name={`recipient-${approval.communicationId}`} checked={choice === c.id} onChange={() => setChoice(c.id)} />
              {c.value}
              <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                · from {SOURCE_LABEL[c.source] ?? c.source.toLowerCase()} ({c.confidence})
              </span>
            </label>
          ))}
          <label className="flex items-center gap-2 flex-wrap" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)' }}>
            <input type="radio" name={`recipient-${approval.communicationId}`} checked={choice === 'custom'} onChange={() => setChoice('custom')} />
            Another address:
            <input
              type="email"
              value={customEmail}
              onChange={(e) => { setCustomEmail(e.target.value); setChoice('custom') }}
              placeholder="reservations@example.com"
              aria-label="Another email address"
              className="glass-card px-2 py-1 text-white bg-transparent outline-none"
              style={{ fontSize: '0.75rem', minWidth: '14rem' }}
            />
          </label>
        </fieldset>
      )}

      <div className="flex items-center gap-2 flex-wrap mt-1">
        <button type="button" onClick={() => decide(true)} disabled={busy} className={styles.manageBtn}>
          {busy ? 'Working…' : approval.isFollowUp ? 'Yes, send the follow-up' : 'Yes, send it'}
        </button>
        <button type="button" onClick={() => decide(false)} disabled={busy} className={styles.manageBtnSecondary}>
          {approval.isFollowUp ? "Don't follow up" : "No, I'll handle it"}
        </button>
      </div>
      {error && <p role="alert" style={{ fontSize: '11px', color: '#e5484d' }}>{error}</p>}
    </div>
  )
}

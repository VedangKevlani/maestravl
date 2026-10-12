'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EDITABLE_SEGMENT_FIELDS } from '@/lib/voice/types'
import type { ProposedAction, ProposedActionKind } from '@/lib/voice/types'

/**
 * The only way anything the assistant prepared ever happens: the passenger
 * reads exactly what it will do and taps Confirm. The endpoint is chosen
 * here from the action's kind — never a URL supplied by the server or the
 * model — and it's the same endpoint the equivalent button in the app
 * uses, called with the passenger's own session, so every ownership and
 * status check runs again server-side. The assistant can't do anything
 * the passenger couldn't do themselves.
 */
const ALLOWED_SEGMENT_FIELDS = new Set<string>(Object.values(EDITABLE_SEGMENT_FIELDS))

type CardRequest = { url: string; body: unknown; method?: 'POST' | 'PATCH' }

function requestFor(action: ProposedAction): CardRequest | null {
  const byKind: Record<ProposedActionKind, () => CardRequest | null> = {
    report_delay: () =>
      action.newDepartureTime
        ? { url: `/api/segments/${action.segmentId}/report-disruption`, body: { status: 'DELAYED', newDepartureTime: action.newDepartureTime } }
        : null,
    report_cancellation: () => ({ url: `/api/segments/${action.segmentId}/report-disruption`, body: { status: 'CANCELLED' } }),
    confirm_reschedule: () => (action.runId ? { url: `/api/agent-runs/${action.runId}/confirm-reschedule`, body: { accept: true } } : null),
    reject_reschedule: () => (action.runId ? { url: `/api/agent-runs/${action.runId}/confirm-reschedule`, body: { accept: false } } : null),
    approve_contact: () =>
      action.runId && action.communicationId
        ? { url: `/api/agent-runs/${action.runId}/approve-contact`, body: { communicationId: action.communicationId, approve: true } }
        : null,
    decline_contact: () =>
      action.runId && action.communicationId
        ? { url: `/api/agent-runs/${action.runId}/approve-contact`, body: { communicationId: action.communicationId, approve: false } }
        : null,
    check_status_now: () => ({ url: `/api/segments/${action.segmentId}/monitor`, body: {} }),
    mark_resolved: () => (action.runId ? { url: `/api/agent-runs/${action.runId}/resolve`, body: {} } : null),
    add_passenger: () =>
      action.tripId && action.passenger
        ? {
            url: `/api/trips/${action.tripId}/passengers`,
            body: { name: action.passenger.name, ...(action.passenger.email ? { email: action.passenger.email } : {}), ...(action.passenger.phone ? { phone: action.passenger.phone } : {}) },
          }
        : null,
    update_segment: () => {
      // Only the small, whitelisted details — never times, status or anything else.
      const entries = Object.entries(action.segmentUpdate ?? {}).filter(([k]) => ALLOWED_SEGMENT_FIELDS.has(k))
      return entries.length ? { url: `/api/segments/${action.segmentId}`, method: 'PATCH', body: Object.fromEntries(entries) } : null
    },
  }
  return byKind[action.kind]?.() ?? null
}

const DONE_TEXT: Record<ProposedActionKind, string> = {
  report_delay: 'Done — delay reported. Maestravl is working out what it affects.',
  report_cancellation: 'Done — cancellation reported. Maestravl is working out what it affects.',
  confirm_reschedule: 'Done — your itinerary is updated.',
  reject_reschedule: "Done — the reply is marked as not a yes; it's still open for you.",
  approve_contact: 'Done — the message was sent.',
  decline_contact: "Done — nothing was sent.",
  check_status_now: 'Done — status checked. The trip page shows the latest.',
  mark_resolved: 'Done — marked as resolved.',
  add_passenger: 'Done — passenger added.',
  update_segment: 'Done — updated.',
}

export default function ProposedActionCard({ action }: { action: ProposedAction }) {
  const router = useRouter()
  const [state, setState] = useState<'pending' | 'working' | 'done' | 'dismissed' | 'failed'>('pending')
  const [message, setMessage] = useState<string | null>(null)

  async function confirm() {
    const req = requestFor(action)
    if (!req) {
      setState('failed')
      setMessage("This action is missing details, so it wasn't run. Try asking again.")
      return
    }
    setState('working')
    try {
      const res = await fetch(req.url, { method: req.method ?? 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setState('failed')
        setMessage(data.error || "That didn't go through — nothing was changed. You can do it from the trip page instead.")
        return
      }
      setState('done')
      // report-disruption answers 200 with no disruption when a change is
      // too small to start a recovery — say so rather than claim success.
      setMessage(action.kind === 'report_delay' && data && data.disruption === null && data.message ? data.message : DONE_TEXT[action.kind])
      router.refresh()
    } catch {
      setState('failed')
      setMessage("Couldn't reach Maestravl — nothing was changed. Check your connection and try again.")
    }
  }

  return (
    <div
      role="group"
      aria-label="Action waiting for your confirmation"
      className="glass-card p-3"
      style={{ border: '1px solid rgba(143,193,128,0.35)', maxWidth: '92%' }}
    >
      <p className="text-label text-white/40" style={{ fontSize: '0.6rem', letterSpacing: '0.08em' }}>
        {state === 'done' ? 'CONFIRMED' : state === 'dismissed' ? 'CANCELLED' : 'NEEDS YOUR CONFIRMATION'}
      </p>
      <p className="text-editorial text-white mt-1" style={{ fontSize: '0.85rem' }}>{action.title}</p>
      {action.detail && state === 'pending' && (
        <p className="text-editorial text-white/55 mt-1" style={{ fontSize: '0.75rem' }}>{action.detail}</p>
      )}
      {(state === 'pending' || state === 'working') && (
        <div className="flex gap-2 mt-2.5">
          <button
            type="button"
            onClick={confirm}
            disabled={state === 'working'}
            className="rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ background: '#8fc180', color: '#12271c' }}
          >
            {state === 'working' ? 'Working…' : 'Confirm'}
          </button>
          <button
            type="button"
            onClick={() => setState('dismissed')}
            disabled={state === 'working'}
            className="rounded-full px-3 py-1.5 text-xs text-white/70"
            style={{ border: '1px solid rgba(255,255,255,0.2)' }}
          >
            Cancel
          </button>
        </div>
      )}
      {message && (
        <p role={state === 'failed' ? 'alert' : 'status'} className="mt-2" style={{ fontSize: '0.75rem', color: state === 'failed' ? '#e88a7d' : 'rgba(255,255,255,0.7)' }}>
          {message}
        </p>
      )}
    </div>
  )
}

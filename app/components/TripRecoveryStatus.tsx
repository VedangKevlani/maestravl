'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { STATUS_COPY, actionLabel, toneOf } from '@/lib/agents/statusCopy'
import { isTerminalRunStatus } from '@/lib/constants'

interface ActivityAction {
  id: string
  type: string
  description: string
  status: string
  createdAt: string
}

interface ActivityRun {
  id: string
  status: string
  summary: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  disruption: { segmentLabel: string; newStatus: string; delayMinutes: number | null }
  actions: ActivityAction[]
}

interface Communication {
  id: string
  direction: 'OUTBOUND' | 'INBOUND'
  channel: string
  subject: string | null
  content: string
  status: string
  sentAt: string | null
  respondedAt: string | null
  createdAt: string
}

const TONE_COLOR: Record<string, { bg: string; fg: string }> = {
  progress: { bg: 'rgba(74,160,216,0.12)', fg: '#4aa0d8' },
  attention: { bg: 'rgba(212,168,83,0.15)', fg: '#d4a853' },
  resolved: { bg: 'rgba(82,183,136,0.12)', fg: '#52b788' },
  idle: { bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.5)' },
}

// Maestravl has no automated way to know a provider actually replied (no
// inbound email parsing yet — see docs/ARCHITECTURE.md), so these are the
// states where the passenger might genuinely have heard back by phone/text
// themselves and there's a real "mark as resolved" action worth offering.
function canBeManuallyResolved(status: string) {
  return status === 'WAITING_FOR_RESPONSE' || status === 'ACTION_REQUIRED'
}

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.round(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso))
}

const POLL_INTERVAL_MS = 12000

/** One entry in a run's timeline — a dot, the description, and a right-aligned relative time, with enough room to breathe. */
function ActionRow({ action }: { action: ActivityAction }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-2 w-1.5 h-1.5 rounded-full bg-white/25 shrink-0" aria-hidden="true" />
      <p className="flex-1 text-editorial text-white/70 min-w-0" style={{ fontSize: '0.83rem', lineHeight: 1.55 }}>
        {action.description}
      </p>
      <span className="text-label text-white/30 shrink-0 pt-0.5 whitespace-nowrap" style={{ fontSize: '0.65rem' }}>
        {formatRelativeTime(action.createdAt)}
      </span>
    </div>
  )
}

/** A real sent/received message — the proof behind an AgentAction's paraphrase, not another paraphrase. */
function MessageCard({ message }: { message: Communication }) {
  const isInbound = message.direction === 'INBOUND'
  return (
    <div className="rounded-lg p-3" style={{ background: isInbound ? 'rgba(82,183,136,0.06)' : 'rgba(255,255,255,0.03)' }}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span
          className="text-label px-1.5 py-0.5 rounded"
          style={{ fontSize: '0.58rem', background: isInbound ? 'rgba(82,183,136,0.15)' : 'rgba(74,160,216,0.15)', color: isInbound ? '#52b788' : '#4aa0d8' }}
        >
          {isInbound ? "Provider's reply" : 'Sent by Maestravl'}
        </span>
        <span className="text-label text-white/30" style={{ fontSize: '0.6rem' }}>{formatRelativeTime(message.createdAt)}</span>
      </div>
      {message.subject && (
        <p className="text-editorial text-white/80 font-medium mb-1" style={{ fontSize: '0.78rem' }}>{message.subject}</p>
      )}
      <p className="text-editorial text-white/60 whitespace-pre-wrap" style={{ fontSize: '0.78rem', lineHeight: 1.55 }}>
        {message.content}
      </p>
    </div>
  )
}

/** A run's header — segment name + a status dot + calm status label. Shared between the always-open latest run and the collapsed older ones. */
function RunHeader({ run }: { run: ActivityRun }) {
  const colors = TONE_COLOR[toneOf(run.status)]
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colors.fg }} aria-hidden="true" />
      <span className="text-editorial text-white font-medium truncate" style={{ fontSize: '0.85rem' }}>
        {run.disruption.segmentLabel}
      </span>
      <span className="text-label text-white/35 shrink-0" style={{ fontSize: '0.62rem' }}>
        {STATUS_COPY[run.status]?.headline ?? run.status}
      </span>
    </div>
  )
}

/** Lazily-fetched real message thread for one run — the click-through from a claim to its proof. */
function MessagesPanel({ runId }: { runId: string }) {
  const [messages, setMessages] = useState<Communication[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/agent-runs/${runId}/communications`)
      .then((res) => (res.ok ? res.json() : { communications: [] }))
      .then((data) => { if (!cancelled) setMessages(data.communications) })
      .catch(() => { if (!cancelled) setMessages([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [runId])

  if (loading && !messages) {
    return <p className="text-label text-white/30 py-2" style={{ fontSize: '0.65rem' }}>Loading messages…</p>
  }
  if (!messages || messages.length === 0) {
    return <p className="text-label text-white/30 py-2" style={{ fontSize: '0.65rem' }}>No messages sent or received for this yet.</p>
  }
  return (
    <div className="flex flex-col gap-2 py-2">
      {messages.map((m) => <MessageCard key={m.id} message={m} />)}
    </div>
  )
}

export default function TripRecoveryStatus({ tripId }: { tripId: string }) {
  const [runs, setRuns] = useState<ActivityRun[] | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [openRunIds, setOpenRunIds] = useState<Set<string>>(new Set())
  const [messagesOpenRunIds, setMessagesOpenRunIds] = useState<Set<string>>(new Set())
  const [headlineMessagesOpen, setHeadlineMessagesOpen] = useState(false)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [resolveNote, setResolveNote] = useState('')
  const [resolving, setResolving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/trips/${tripId}/activity`)
      if (!res.ok) return
      const data = await res.json()
      setRuns(data.runs)
    } catch {
      // A failed poll just means the next one tries again — the panel
      // simply keeps showing what it last knew rather than erroring out
      // in front of someone already dealing with a disrupted trip.
    }
  }, [tripId])

  useEffect(() => {
    load()
    timerRef.current = setInterval(load, POLL_INTERVAL_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [load])

  // Nothing to show yet (first load) — render nothing rather than a
  // loading skeleton; this bar should feel like it's always been there.
  if (runs === null) return null

  const activeRun = runs.find((r) => !isTerminalRunStatus(r.status))
  const headlineRun = activeRun ?? runs[0] ?? null
  const copy = headlineRun ? STATUS_COPY[headlineRun.status] ?? { headline: headlineRun.status, tone: 'progress' as const } : null
  const tone = runs.length === 0 ? 'idle' : copy?.tone ?? 'progress'
  const colors = TONE_COLOR[tone]

  const latestAction = headlineRun?.actions[headlineRun.actions.length - 1] ?? null
  const latestActionLabel = latestAction ? actionLabel(latestAction.type, latestAction.description) : null
  const isReschedulingPrompt = headlineRun?.status === 'RESCHEDULING'

  // The banner shows one real thing at a time: the latest concrete action
  // that actually happened, not a canned phrase — that generic headline is
  // demoted to a small phase tag instead. Only falls back to the phase
  // copy when there's genuinely nothing more specific yet (a fresh run) or
  // the run has wrapped up.
  const bannerText =
    runs.length === 0
      ? 'Maestravl is watching your trip — nothing needs your attention.'
      : latestActionLabel && !isTerminalRunStatus(headlineRun!.status)
        ? latestActionLabel
        : copy?.headline

  // Most recent run gets its full timeline shown right away; anything
  // older is a single collapsed row until explicitly clicked open — a
  // trip with several past disruptions shouldn't dump all of them on you
  // at once.
  const [mostRecentRun, ...olderRuns] = runs

  function toggleRun(id: string) {
    setOpenRunIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleMessages(id: string) {
    setMessagesOpenRunIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleResolve() {
    if (!headlineRun) return
    setResolving(true)
    await fetch(`/api/agent-runs/${headlineRun.id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: resolveNote.trim() || undefined }),
    })
    setResolving(false)
    setResolveOpen(false)
    setResolveNote('')
    await load()
  }

  async function handleConfirmReschedule(accept: boolean) {
    if (!headlineRun) return
    setConfirming(true)
    await fetch(`/api/agent-runs/${headlineRun.id}/confirm-reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accept }),
    })
    setConfirming(false)
    await load()
  }

  return (
    <div className="glass-card p-5 mb-10">
      <div className="flex items-start gap-3">
        <span
          className="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: colors.fg, boxShadow: tone === 'progress' ? `0 0 0 4px ${colors.bg}` : undefined }}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          {headlineRun && (
            <span className="text-label shrink-0 mr-2" style={{ fontSize: '0.6rem', color: colors.fg }}>
              {copy?.headline !== bannerText ? (STATUS_COPY[headlineRun.status]?.headline ?? headlineRun.status) : null}
            </span>
          )}
          <p key={latestAction?.id ?? headlineRun?.status ?? 'idle'} className="text-editorial text-white font-medium fade-in-text" style={{ fontSize: '0.95rem' }}>
            {bannerText}
          </p>
          {latestAction && (
            <p className="text-editorial text-white/30 mt-1" style={{ fontSize: '0.7rem' }}>
              {formatRelativeTime(latestAction.createdAt)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {headlineRun && (
            <button
              onClick={() => setHeadlineMessagesOpen((v) => !v)}
              className="text-label text-white/40 hover:text-white/80 whitespace-nowrap"
              style={{ fontSize: '0.65rem' }}
            >
              {headlineMessagesOpen ? 'Hide messages' : 'View messages'}
            </button>
          )}
          {headlineRun && canBeManuallyResolved(headlineRun.status) && (
            <button
              onClick={() => setResolveOpen((v) => !v)}
              className="text-label text-white/40 hover:text-white/80 whitespace-nowrap"
              style={{ fontSize: '0.65rem' }}
            >
              {resolveOpen ? 'Cancel' : 'Heard back?'}
            </button>
          )}
          {runs.length > 0 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-label text-white/40 hover:text-white/80 whitespace-nowrap"
              style={{ fontSize: '0.65rem' }}
            >
              {expanded ? 'Hide activity' : 'View all activity'}
            </button>
          )}
          {runs.length > 0 && (
            <a
              href={`/api/trips/${tripId}/activity/pdf`}
              className="text-label text-white/40 hover:text-white/80 whitespace-nowrap"
              style={{ fontSize: '0.65rem' }}
              title="Download this trip's full recovery history as a PDF, for a support conversation"
            >
              Download activity log (PDF)
            </a>
          )}
        </div>
      </div>

      {isReschedulingPrompt && headlineRun && (
        <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-3" style={{ background: 'rgba(74,160,216,0.05)', margin: '1rem -1.25rem -1.25rem', padding: '1rem 1.25rem' }}>
          <p className="text-editorial text-white/80" style={{ fontSize: '0.82rem', lineHeight: 1.55 }}>
            {headlineRun.summary}
          </p>
          <p className="text-label text-white/40" style={{ fontSize: '0.6rem' }}>
            Maestravl thinks this reply means yes, but only you can confirm it — read the actual message below before deciding.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleConfirmReschedule(true)}
              disabled={confirming}
              className="px-4 py-1.5 rounded-full text-label disabled:opacity-50"
              style={{ background: 'var(--warm-white)', color: 'var(--charcoal)', fontSize: '0.65rem' }}
            >
              {confirming ? 'Updating…' : 'Confirm — update itinerary'}
            </button>
            <button
              onClick={() => handleConfirmReschedule(false)}
              disabled={confirming}
              className="px-4 py-1.5 rounded-full text-label disabled:opacity-50 border border-white/15"
              style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.65rem' }}
            >
              Not quite — keep working on it
            </button>
          </div>
        </div>
      )}

      {headlineMessagesOpen && headlineRun && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <MessagesPanel runId={headlineRun.id} />
        </div>
      )}

      {resolveOpen && headlineRun && (
        <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-2">
          <p className="text-label text-white/40" style={{ fontSize: '0.6rem' }}>
            Maestravl can't yet tell automatically when a provider replies — if you heard back yourself (call, text,
            email), let it know here so your trip status stays accurate.
          </p>
          <textarea
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            placeholder="What did they say? (optional)"
            rows={2}
            className="glass-card px-3 py-2 text-editorial text-white bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
            style={{ fontSize: '0.82rem' }}
          />
          <button
            onClick={handleResolve}
            disabled={resolving}
            className="self-start px-4 py-1.5 rounded-full text-label disabled:opacity-50"
            style={{ background: 'var(--warm-white)', color: 'var(--charcoal)', fontSize: '0.65rem' }}
          >
            {resolving ? 'Saving…' : 'Mark as resolved'}
          </button>
        </div>
      )}

      {expanded && (
        <div className="mt-5 pt-5 border-t border-white/10 flex flex-col gap-6 max-h-[32rem] overflow-y-auto">
          {mostRecentRun && (
            <div>
              <div className="flex items-center justify-between gap-3">
                <RunHeader run={mostRecentRun} />
                <button
                  onClick={() => toggleMessages(mostRecentRun.id)}
                  className="text-label text-white/30 hover:text-white/70 whitespace-nowrap shrink-0"
                  style={{ fontSize: '0.6rem' }}
                >
                  {messagesOpenRunIds.has(mostRecentRun.id) ? 'Hide messages' : 'View messages'}
                </button>
              </div>
              {messagesOpenRunIds.has(mostRecentRun.id) && <MessagesPanel runId={mostRecentRun.id} />}
              <div className="mt-2 pl-4 divide-y divide-white/5">
                {mostRecentRun.actions.map((a) => (
                  <ActionRow key={a.id} action={a} />
                ))}
              </div>
            </div>
          )}

          {olderRuns.length > 0 && (
            <div>
              <p className="text-label text-white/25 mb-2" style={{ fontSize: '0.6rem' }}>Earlier</p>
              <div className="flex flex-col divide-y divide-white/5">
                {olderRuns.map((run) => {
                  const isOpen = openRunIds.has(run.id)
                  return (
                    <div key={run.id}>
                      <button
                        onClick={() => toggleRun(run.id)}
                        className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-white/[0.03] rounded-lg px-2 -mx-2 transition-colors"
                        aria-expanded={isOpen}
                      >
                        <RunHeader run={run} />
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-label text-white/25 whitespace-nowrap" style={{ fontSize: '0.6rem' }}>
                            {run.actions.length} update{run.actions.length === 1 ? '' : 's'} · {formatRelativeTime(run.createdAt)}
                          </span>
                          <span className="text-white/30 select-none" style={{ fontSize: '0.6rem' }}>{isOpen ? '▲' : '▼'}</span>
                        </div>
                      </button>
                      {isOpen && (
                        <div className="pl-4 pb-2 divide-y divide-white/5">
                          {run.actions.map((a) => (
                            <ActionRow key={a.id} action={a} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

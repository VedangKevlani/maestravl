'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentActionType } from '@/lib/constants'

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

// Calm, human headline per run status — this is what a stressed-out
// passenger reads first, so no raw enum values (WAITING_FOR_RESPONSE, etc.)
// and no "technical" framing (confidence scores, action types) ever show
// up here. The full, more detailed log is opt-in via "View all activity."
const STATUS_COPY: Record<string, { headline: string; tone: 'progress' | 'attention' | 'resolved' }> = {
  DETECTED: { headline: 'Maestravl noticed a change and is looking into it', tone: 'progress' },
  ANALYZING: { headline: "Maestravl is checking what this affects", tone: 'progress' },
  CONTACTING: { headline: 'Maestravl is reaching out on your behalf', tone: 'progress' },
  WAITING_FOR_RESPONSE: { headline: "Maestravl is waiting to hear back", tone: 'progress' },
  RESCHEDULING: { headline: 'Maestravl is updating your itinerary', tone: 'progress' },
  CONFIRMED: { headline: "Confirmed — you're all set", tone: 'resolved' },
  ALTERNATIVE_FOUND: { headline: 'Maestravl found some options for you', tone: 'attention' },
  ACTION_REQUIRED: { headline: 'A couple of things need your attention', tone: 'attention' },
  FAILED: { headline: "Something didn't go through — here's what to do", tone: 'attention' },
  COMPLETED: { headline: "You're all set — nothing else needs your attention", tone: 'resolved' },
}

// Short, friendly label per action type — used for the single-line "live"
// ticker so it reads like a person narrating, not a system log. VERIFY is
// deliberately absent: its descriptions are already specific and calm
// (e.g. a quoted provider reply, or "You marked this as resolved") and
// overriding them with a generic label would hide exactly the detail a
// passenger most wants to see there.
const ACTION_TYPE_LABEL: Record<string, string> = {
  ANALYZE_IMPACT: 'Checking what this affects',
  FIND_CONTACT: 'Looking up contact information',
  CONTACT_PROVIDER: 'Reaching out to a provider',
  REQUEST_RESCHEDULE: 'Requesting a new time',
  UPDATE_ITINERARY: 'Updating your itinerary',
  NOTIFY_PASSENGER: 'Sending you an update',
  SEARCH_ALTERNATIVES: 'Looking for other options',
  ESCALATE: 'Flagging something for you',
}

const TONE_COLOR: Record<string, { bg: string; fg: string }> = {
  progress: { bg: 'rgba(74,160,216,0.12)', fg: '#4aa0d8' },
  attention: { bg: 'rgba(212,168,83,0.15)', fg: '#d4a853' },
  resolved: { bg: 'rgba(82,183,136,0.12)', fg: '#52b788' },
  idle: { bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.5)' },
}

function toneOf(status: string): keyof typeof TONE_COLOR {
  return STATUS_COPY[status]?.tone ?? 'progress'
}

function isTerminal(status: string) {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'CONFIRMED'
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

export default function TripRecoveryStatus({ tripId }: { tripId: string }) {
  const [runs, setRuns] = useState<ActivityRun[] | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [openRunIds, setOpenRunIds] = useState<Set<string>>(new Set())
  const [resolveOpen, setResolveOpen] = useState(false)
  const [resolveNote, setResolveNote] = useState('')
  const [resolving, setResolving] = useState(false)
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

  const activeRun = runs.find((r) => !isTerminal(r.status))
  const headlineRun = activeRun ?? runs[0] ?? null
  const copy = headlineRun ? STATUS_COPY[headlineRun.status] ?? { headline: headlineRun.status, tone: 'progress' as const } : null
  const tone = runs.length === 0 ? 'idle' : copy?.tone ?? 'progress'
  const colors = TONE_COLOR[tone]

  const latestAction = headlineRun?.actions[headlineRun.actions.length - 1] ?? null
  const latestActionLabel = latestAction
    ? ACTION_TYPE_LABEL[latestAction.type as AgentActionType] ?? latestAction.description
    : null

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

  return (
    <div className="glass-card p-5 mb-10">
      <div className="flex items-start gap-3">
        <span
          className="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: colors.fg, boxShadow: tone === 'progress' ? `0 0 0 4px ${colors.bg}` : undefined }}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <p className="text-editorial text-white font-medium" style={{ fontSize: '0.95rem' }}>
            {runs.length === 0 ? 'Maestravl is watching your trip — nothing needs your attention.' : copy?.headline}
          </p>
          {latestActionLabel && (
            <p className="text-editorial text-white/50 mt-1" style={{ fontSize: '0.8rem' }}>
              {latestActionLabel}
              {latestAction && <span className="text-white/30"> · {formatRelativeTime(latestAction.createdAt)}</span>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
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
        </div>
      </div>

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
              <RunHeader run={mostRecentRun} />
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

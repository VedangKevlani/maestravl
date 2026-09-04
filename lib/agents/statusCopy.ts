// Pure — the passenger-facing wording for agent-run/action states. Shared
// between app/components/TripRecoveryStatus.tsx (the UI) and lib/voice/
// (the voice assistant's tool results), so the two never say different
// things about the same recovery run.
import type { AgentActionType } from '@/lib/constants'

// Calm, human headline per run status — this is what a stressed-out
// passenger reads first, so no raw enum values (WAITING_FOR_RESPONSE, etc.)
// and no "technical" framing (confidence scores, action types) ever show
// up here. The full, more detailed log is opt-in via "View all activity."
export const STATUS_COPY: Record<string, { headline: string; tone: 'progress' | 'attention' | 'resolved' }> = {
  DETECTED: { headline: 'Maestravl noticed a change and is looking into it', tone: 'progress' },
  ANALYZING: { headline: "Maestravl is checking what this affects", tone: 'progress' },
  CONTACTING: { headline: 'Maestravl is reaching out on your behalf', tone: 'progress' },
  AWAITING_APPROVAL: { headline: 'Maestravl found a contact — waiting for your OK', tone: 'attention' },
  WAITING_FOR_RESPONSE: { headline: "Maestravl is waiting to hear back", tone: 'progress' },
  RESCHEDULING: { headline: 'Maestravl is updating your itinerary', tone: 'progress' },
  CONFIRMED: { headline: "Confirmed — you're all set", tone: 'resolved' },
  ALTERNATIVE_FOUND: { headline: 'Maestravl found some options for you', tone: 'attention' },
  ACTION_REQUIRED: { headline: 'A couple of things need your attention', tone: 'attention' },
  FAILED: { headline: "Something didn't go through — here's what to do", tone: 'attention' },
  COMPLETED: { headline: "You're all set — nothing else needs your attention", tone: 'resolved' },
  SUPERSEDED: { headline: 'Superseded by a newer report', tone: 'resolved' },
}

// Short, friendly label per action type — used for the single-line "live"
// ticker so it reads like a person narrating, not a system log. VERIFY is
// deliberately absent: its descriptions are already specific and calm
// (e.g. a quoted provider reply, or "You marked this as resolved") and
// overriding them with a generic label would hide exactly the detail a
// passenger most wants to see there.
export const ACTION_TYPE_LABEL: Record<string, string> = {
  ANALYZE_IMPACT: 'Checking what this affects',
  FIND_CONTACT: 'Looking up contact information',
  CONTACT_PROVIDER: 'Reaching out to a provider',
  REQUEST_RESCHEDULE: 'Requesting a new time',
  UPDATE_ITINERARY: 'Updating your itinerary',
  NOTIFY_PASSENGER: 'Sending you an update',
  SEARCH_ALTERNATIVES: 'Looking for other options',
  ESCALATE: 'Flagging something for you',
}

export function toneOf(status: string): 'progress' | 'attention' | 'resolved' {
  return STATUS_COPY[status]?.tone ?? 'progress'
}

export function actionLabel(type: string, fallbackDescription: string): string {
  return ACTION_TYPE_LABEL[type as AgentActionType] ?? fallbackDescription
}

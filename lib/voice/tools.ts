// Pure — tool schemas only, no execution logic (see toolExecutors.ts and
// agent.ts for that). Plain JSON Schema (not tied to any SDK's types) —
// passed straight into Groq's OpenAI-compatible `tools` parameter.
//
// Three kinds of tool:
// - Read: the user's trips and what Maestravl knows about them, plus
//   "around your trip" lookups (weather, places, local time, currency).
// - navigate: moves the user between Maestravl's own pages. Changes no
//   data, so it runs without a confirmation card.
// - propose_action: writes NOTHING. It prepares an action the user then
//   confirms with a tap, which runs through the app's normal endpoints
//   (app/components/chat/ProposedActionCard.tsx).
//
// Descriptions are kept short on purpose: every token here is re-sent on
// every Groq call, and the free tier limits tokens per minute.
import { z } from 'zod'
import { PROPOSED_ACTION_KINDS, EDITABLE_SEGMENT_FIELDS } from './types'

const text = (max = 200) => z.string().trim().min(1).max(max)

/**
 * Optional arguments arrive as null as often as they're omitted (seen live
 * from gpt-oss: `"trip": null`). Treat null as "not given" — otherwise the
 * call is rejected and its tokens are wasted on a retry. The JSON Schema
 * side allows null too (VOICE_TOOLS below).
 */
const opt = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => (v === null ? undefined : v), schema.optional())
const tripArg = opt(text())
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{1,2}:\d{2}$/

export const ListTripsArgsSchema = z.object({}).strict()
export const GetNeedsYouArgsSchema = z.object({}).strict()
export const GetItineraryArgsSchema = z.object({ trip: tripArg })
export const GetSegmentStatusArgsSchema = z.object({ segment: text(), trip: tripArg })
export const GetRecoveryActivityArgsSchema = z.object({ segment: opt(text()), trip: tripArg })
export const CheckItineraryArgsSchema = z.object({ trip: tripArg })

/** Where a lookup is about: a segment of a trip, or a free-text place. */
const placeArgs = { place: opt(text()), segment: opt(text()), trip: tripArg }
export const LocalTimeArgsSchema = z.object(placeArgs)
export const WeatherArgsSchema = z.object({ ...placeArgs, date: opt(z.string().regex(DATE, 'Use YYYY-MM-DD')) })
export const NearbyPlacesArgsSchema = z.object(placeArgs)
export const ConvertCurrencyArgsSchema = z.object({
  amount: z.number().positive().max(1e12),
  from: z.string().trim().regex(/^[A-Za-z]{3}$/, 'Use a 3-letter currency code'),
  to: z.string().trim().regex(/^[A-Za-z]{3}$/, 'Use a 3-letter currency code'),
})

export const NavigateArgsSchema = z.object({
  to: z.enum(['dashboard', 'notifications', 'trip', 'trip_map']),
  trip: tripArg,
})

export const ProposeActionArgsSchema = z.object({
  action: z.enum(PROPOSED_ACTION_KINDS),
  segment: opt(text()),
  trip: tripArg,
  /** report_delay — local date at the segment, YYYY-MM-DD. Defaults to the currently scheduled day. */
  newDate: opt(z.string().regex(DATE, 'Use YYYY-MM-DD')),
  /** report_delay — local 24-hour time at the segment, HH:mm. */
  newTime: opt(z.string().regex(TIME, 'Use 24-hour HH:mm, e.g. 18:30')),
  /** add_passenger */
  passengerName: opt(text(150)),
  passengerEmail: opt(z.string().trim().email('That email address looks wrong').max(200)),
  passengerPhone: opt(z.string().trim().min(5).max(40)),
  /** update_segment */
  field: opt(z.enum(Object.keys(EDITABLE_SEGMENT_FIELDS) as [keyof typeof EDITABLE_SEGMENT_FIELDS, ...(keyof typeof EDITABLE_SEGMENT_FIELDS)[]])),
  value: opt(z.string().trim().max(2000)),
})

interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

const TRIP_PROP = { type: 'string', description: "Which trip, as the user said it (e.g. 'Jamaica', 'next'). Omit to use the trip in focus." }
const SEGMENT_PROP = { type: 'string', description: "How the user referred to it: 'AA123', 'the flight to Miami', 'my hotel', 'next'." }
const PLACE_PROPS = {
  place: { type: 'string', description: 'A place name or airport code, when not about a trip segment.' },
  segment: { ...SEGMENT_PROP, description: 'A trip segment — uses its destination.' },
  trip: TRIP_PROP,
}

const RAW_TOOLS: ToolDefinition[] = [
  {
    name: 'list_trips',
    description: "The user's trips: titles, dates, status, and each trip's next segment. Use for 'what trips do I have', 'when is my next trip'.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_needs_you',
    description: 'Decisions waiting on the user across all trips (approvals, reschedules to confirm, things needing attention).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_itinerary',
    description: "One trip's passengers and segments in order, with times, places and confirmation details.",
    parameters: { type: 'object', properties: { trip: TRIP_PROP } },
  },
  {
    name: 'get_segment_status',
    description: 'Current status and live monitoring info for ONE segment.',
    parameters: { type: 'object', properties: { segment: SEGMENT_PROP, trip: TRIP_PROP }, required: ['segment'] },
  },
  {
    name: 'get_recovery_activity',
    description: 'What Maestravl has done or is doing about a disruption, including anything waiting on the user.',
    parameters: { type: 'object', properties: { segment: SEGMENT_PROP, trip: TRIP_PROP } },
  },
  {
    name: 'check_itinerary',
    description: 'Checks a trip for problems: missed or tight connections, segments out of order, different airports, times that end before they start.',
    parameters: { type: 'object', properties: { trip: TRIP_PROP } },
  },
  {
    name: 'local_time',
    description: "Current local time somewhere, and the difference from the user's home time.",
    parameters: { type: 'object', properties: PLACE_PROPS },
  },
  {
    name: 'weather',
    description: 'Weather forecast (up to about 9 days ahead) for a place or a segment destination.',
    parameters: { type: 'object', properties: { ...PLACE_PROPS, date: { type: 'string', description: 'YYYY-MM-DD. Defaults to the segment arrival day, or today.' } } },
  },
  {
    name: 'nearby_places',
    description: 'Notable places within about 5 km of a place or a segment destination (from Wikipedia).',
    parameters: { type: 'object', properties: PLACE_PROPS },
  },
  {
    name: 'convert_currency',
    description: 'Converts money between currencies at daily rates.',
    parameters: {
      type: 'object',
      properties: { amount: { type: 'number' }, from: { type: 'string', description: '3-letter code, e.g. USD' }, to: { type: 'string', description: '3-letter code, e.g. JMD' } },
      required: ['amount', 'from', 'to'],
    },
  },
  {
    name: 'navigate',
    description: "Opens a page in Maestravl for the user: their dashboard, notifications, a trip's timeline, or a trip's map. Only when they ask to go somewhere.",
    parameters: { type: 'object', properties: { to: { type: 'string', enum: ['dashboard', 'notifications', 'trip', 'trip_map'] }, trip: TRIP_PROP }, required: ['to'] },
  },
  {
    name: 'propose_action',
    description:
      'Prepares ONE change for the user to confirm with a tap — it does nothing by itself. Only when the user clearly asks. ' +
      'report_delay (newTime, newDate if another day), report_cancellation, confirm_reschedule, reject_reschedule, ' +
      'approve_contact, decline_contact, check_status_now, mark_resolved, add_passenger (passengerName, optional passengerEmail/passengerPhone), ' +
      'update_segment (field + value: seat, gate, terminal, confirmation_number, notes).',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...PROPOSED_ACTION_KINDS] },
        segment: SEGMENT_PROP,
        trip: TRIP_PROP,
        newDate: { type: 'string', description: 'YYYY-MM-DD, local to the segment.' },
        newTime: { type: 'string', description: 'HH:mm 24-hour, local to the segment.' },
        passengerName: { type: 'string' },
        passengerEmail: { type: 'string' },
        passengerPhone: { type: 'string' },
        field: { type: 'string', enum: Object.keys(EDITABLE_SEGMENT_FIELDS) },
        value: { type: 'string' },
      },
      required: ['action'],
    },
  },
]

/** What's sent to Groq, which validates tool calls server-side: every optional property also accepts null (see opt above). */
export const VOICE_TOOLS: ToolDefinition[] = RAW_TOOLS.map((tool) => ({
  ...tool,
  parameters: {
    ...tool.parameters,
    properties: Object.fromEntries(
      Object.entries(tool.parameters.properties).map(([key, prop]) => {
        const p = prop as { type?: string }
        const required = tool.parameters.required?.includes(key)
        return [key, required || !p.type ? prop : { ...p, type: [p.type, 'null'] }]
      })
    ),
  },
}))

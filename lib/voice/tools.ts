// Pure — tool schemas only, no execution logic (see toolExecutors.ts for
// that). Three read-only tools, mapping 1:1 onto the persona's three
// question categories: itinerary, one segment's status, and recovery
// activity. Deliberately no mutating tools — the voice assistant never
// writes to a trip (see lib/voice/systemPrompt.ts); report-a-delay/
// check-live-status/respond-to-reschedule stay actions the passenger
// performs in the app, which voice can describe but never execute. Plain
// JSON Schema (not tied to any SDK's types) — passed straight into Groq's
// OpenAI-compatible `tools` parameter by lib/voice/agent.ts.
import { z } from 'zod'

export const GetItineraryArgsSchema = z.object({}).strict()

export const GetSegmentStatusArgsSchema = z.object({
  segment: z.string().trim().min(1).max(200),
})

export const GetRecoveryActivityArgsSchema = z.object({
  segment: z.string().trim().min(1).max(200).optional(),
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

export const VOICE_TOOLS: ToolDefinition[] = [
  {
    name: 'get_itinerary',
    description:
      "Get the passenger's full itinerary for this trip: passengers and every segment in order with transport " +
      "type, provider, times, locations, and confirmation details. Call this for any question about what's on " +
      'the itinerary, what is next, or trip details in general.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_segment_status',
    description:
      'Look up the current status and live monitoring info for ONE specific segment (a flight, train, hotel, ' +
      'etc). Call this when the passenger asks about the status of a specific leg of their trip.',
    parameters: {
      type: 'object',
      properties: {
        segment: {
          type: 'string',
          description:
            "How the passenger referred to it, e.g. 'AA123', 'the flight to Miami', 'my hotel', 'the next " +
            "segment', 'the first one'.",
        },
      },
      required: ['segment'],
    },
  },
  {
    name: 'get_recovery_activity',
    description:
      'Look up what Maestravl has done or is doing about a disruption — recent recovery runs, the actions ' +
      'taken, and their current status, including anything still waiting on the passenger (e.g. a reschedule ' +
      'they need to accept or reject in the app). Call this when the passenger asks what Maestravl is doing ' +
      'about a delay, cancellation, or change, or wants an update on an ongoing issue.',
    parameters: {
      type: 'object',
      properties: {
        segment: {
          type: 'string',
          description: 'Optional — narrow to one segment, same referring style as get_segment_status. Omit for all recent recovery activity.',
        },
      },
    },
  },
]

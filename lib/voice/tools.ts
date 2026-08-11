// Pure — tool schemas only, no execution logic (see toolExecutors.ts for
// that). Three tools, mapping 1:1 onto the persona's three question
// categories: itinerary, one segment's status, and recovery activity.
// Shapes match @google/genai's FunctionDeclaration (parametersJsonSchema
// accepts plain JSON schema — verified against the installed SDK's own
// type definitions, not just docs).
import { z } from 'zod'
import type { FunctionDeclaration } from '@google/genai'

export const GetItineraryArgsSchema = z.object({}).strict()

export const GetSegmentStatusArgsSchema = z.object({
  segment: z.string().trim().min(1).max(200),
})

export const GetRecoveryActivityArgsSchema = z.object({
  segment: z.string().trim().min(1).max(200).optional(),
})

export const VOICE_TOOLS: FunctionDeclaration[] = [
  {
    name: 'get_itinerary',
    description:
      "Get the passenger's full itinerary for this trip: passengers and every segment in order with transport " +
      "type, provider, times, locations, and confirmation details. Call this for any question about what's on " +
      'the itinerary, what is next, or trip details in general.',
    parametersJsonSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_segment_status',
    description:
      'Look up the current status and live monitoring info for ONE specific segment (a flight, train, hotel, ' +
      'etc). Call this when the passenger asks about the status of a specific leg of their trip.',
    parametersJsonSchema: {
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
      'taken, and their current status. Call this when the passenger asks what Maestravl is doing about a ' +
      'delay, cancellation, or change, or wants an update on an ongoing issue.',
    parametersJsonSchema: {
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

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

// --- Mutating tools -----------------------------------------------------
// Each takes a `mode: 'propose' | 'confirm'` — propose describes what would
// happen and returns a confirmationToken, mutating nothing; confirm (only
// ever called after the passenger's next reply clearly says yes/no) uses
// that exact token to perform the real change. See
// lib/voice/mutationExecutors.ts for the two-mode dispatch and
// lib/voice/systemPrompt.ts for the rules that keep the model honest about
// never skipping the propose step.

export const ReportDelayArgsSchema = z.object({
  mode: z.enum(['propose', 'confirm']),
  segment: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['DELAYED', 'CANCELLED']).optional(),
  newDepartureTime: z.string().datetime().optional(),
  confirmationToken: z.string().min(1).max(200).optional(),
})

export const CheckLiveStatusArgsSchema = z.object({
  mode: z.enum(['propose', 'confirm']),
  segment: z.string().trim().min(1).max(200).optional(),
  confirmationToken: z.string().min(1).max(200).optional(),
})

export const RespondToRescheduleArgsSchema = z.object({
  mode: z.enum(['propose', 'confirm']),
  segment: z.string().trim().min(1).max(200).optional(),
  accept: z.boolean().optional(),
  confirmationToken: z.string().min(1).max(200).optional(),
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
  {
    name: 'report_delay',
    description:
      "Report that a segment is now delayed or cancelled, which WRITES to the trip and can start a recovery " +
      'run. Always call it twice: first with mode "propose" to describe exactly what you are about to report and ' +
      "ask the passenger to confirm; only after they clearly say yes in their NEXT reply, call it again with mode " +
      '"confirm" and the exact confirmationToken you were given, and nothing else. Never call mode "confirm" in ' +
      'the same response as mode "propose", even if the request already sounds like a yes.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['propose', 'confirm'], description: 'propose first, confirm only after the passenger explicitly says yes on a later turn.' },
        segment: { type: 'string', description: 'Required for mode propose — how the passenger referred to the segment.' },
        status: { type: 'string', enum: ['DELAYED', 'CANCELLED'], description: 'Required for mode propose.' },
        newDepartureTime: { type: 'string', description: 'Required for mode propose when status is DELAYED — the new time as an ISO 8601 UTC timestamp.' },
        confirmationToken: { type: 'string', description: 'Required for mode confirm — copy it exactly from the propose result, never alter it.' },
      },
      required: ['mode'],
    },
  },
  {
    name: 'check_live_status',
    description:
      'Contact the live tracking provider right now for one segment — unlike get_segment_status (which only ' +
      'reads what is already known), this spends real, limited monitoring quota. Same two-call propose/confirm ' +
      'rule as report_delay: propose first, confirm only after the passenger says yes on a later turn.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['propose', 'confirm'] },
        segment: { type: 'string', description: 'Required for mode propose.' },
        confirmationToken: { type: 'string', description: 'Required for mode confirm.' },
      },
      required: ['mode'],
    },
  },
  {
    name: 'respond_to_reschedule',
    description:
      "Accept or reject a reschedule Maestravl is waiting on the passenger to confirm. Call mode 'propose' " +
      '(optionally with segment to disambiguate if more than one is pending) to hear what is waiting; the ' +
      "passenger must then clearly say accept or reject before you call mode 'confirm' with that decision and " +
      'the confirmationToken.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['propose', 'confirm'] },
        segment: { type: 'string', description: 'Optional for mode propose — narrows to one pending reschedule if more than one exists.' },
        accept: { type: 'boolean', description: 'Required for mode confirm — true to accept, false to reject.' },
        confirmationToken: { type: 'string', description: 'Required for mode confirm.' },
      },
      required: ['mode'],
    },
  },
]

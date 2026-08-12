// Impure — the only network call in this file is to the Gemini API; the
// tool execution it drives (executeTool below) is a thin dispatch over the
// pure functions in toolExecutors.ts, which is what's actually unit
// tested. Not tested directly here, same convention as
// lib/agents/orchestrator.ts wrapping the pure lib/agents/analyze.ts.
//
// Uses Google Gemini rather than a paid provider: Gemini's free tier for
// Flash models is genuinely ongoing and non-expiring (rate-limited, no
// card, no trial clock) — the only paid option in this whole pipeline is
// the fully optional ElevenLabs primary voice (see lib/voice/tts.ts);
// everything else, including this reasoning step, has no billing path.
import {
  GoogleGenAI,
  createPartFromFunctionResponse,
  type Content,
  type FunctionCall,
} from '@google/genai'
import {
  VOICE_TOOLS,
  GetItineraryArgsSchema,
  GetSegmentStatusArgsSchema,
  GetRecoveryActivityArgsSchema,
  ReportDelayArgsSchema,
  CheckLiveStatusArgsSchema,
  RespondToRescheduleArgsSchema,
} from './tools'
import { executeGetItinerary, executeGetSegmentStatus, executeGetRecoveryActivity } from './toolExecutors'
import { executeReportDelay, executeCheckLiveStatus, executeRespondToReschedule, type MutationMeta } from './mutationExecutors'
import { buildSystemPrompt } from './systemPrompt'
import { deriveNextPendingAction } from './pendingActionBookkeeping'
import type { VoiceContext, VoiceTurnMessage, PendingVoiceAction } from './types'

const MODEL = 'gemini-3.6-flash'
// The model can batch every tool call it needs into one turn, so a normal
// exchange resolves in 1-2 iterations (a function-call round, then a final
// text round). This is a safety rail against a confused tool-call loop,
// not the expected case.
const MAX_TOOL_ITERATIONS = 4
const REQUEST_TIMEOUT_MS = 15000

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

async function executeTool(name: string, rawArgs: unknown, context: VoiceContext, meta: MutationMeta): Promise<Record<string, unknown>> {
  try {
    switch (name) {
      case 'get_itinerary':
        GetItineraryArgsSchema.parse(rawArgs)
        return executeGetItinerary(context)
      case 'get_segment_status':
        return executeGetSegmentStatus(context, GetSegmentStatusArgsSchema.parse(rawArgs))
      case 'get_recovery_activity':
        return executeGetRecoveryActivity(context, GetRecoveryActivityArgsSchema.parse(rawArgs))
      case 'report_delay':
        return await executeReportDelay(context, ReportDelayArgsSchema.parse(rawArgs), meta)
      case 'check_live_status':
        return await executeCheckLiveStatus(context, CheckLiveStatusArgsSchema.parse(rawArgs), meta)
      case 'respond_to_reschedule':
        return await executeRespondToReschedule(context, RespondToRescheduleArgsSchema.parse(rawArgs), meta)
      default:
        return { error: `Unknown tool: ${name}` }
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Invalid tool input' }
  }
}

export async function runVoiceTurn(opts: {
  context: VoiceContext
  history: VoiceTurnMessage[]
  transcript: string
  tripId: string
  userId: string
  pendingAction?: PendingVoiceAction | null
}): Promise<{ replyText: string; pendingAction: PendingVoiceAction | null }> {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) // reads GEMINI_API_KEY at call time if omitted, but explicit is clearer here
  const systemInstruction = buildSystemPrompt(opts.context)
  // One per HTTP call, not per tool call — the same-turn confirm guard in
  // lib/voice/pendingAction.ts compares against this, so a propose and a
  // confirm both happening within this one runVoiceTurn (the tool loop can
  // iterate MAX_TOOL_ITERATIONS times) is structurally impossible to sneak
  // past, not just discouraged by the system prompt.
  const requestNonce = crypto.randomUUID()
  const meta: MutationMeta = { tripId: opts.tripId, userId: opts.userId, requestNonce }

  const contents: Content[] = []
  if (opts.pendingAction) {
    // Replay the exact prior propose call + its result as a real turn,
    // rather than relying on the model's memory of the prose summary it
    // spoke — this is the same Content shape the loop below already
    // produces natively within one turn, just reconstructed from the
    // previous HTTP call instead.
    contents.push({ role: 'model', parts: [{ functionCall: { name: opts.pendingAction.toolName, args: opts.pendingAction.toolArgs } }] })
    contents.push({
      role: 'user',
      parts: [createPartFromFunctionResponse(opts.pendingAction.toolName, opts.pendingAction.toolName, opts.pendingAction.toolResult)],
    })
  }
  contents.push(
    ...opts.history.map((m): Content => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: opts.transcript }] }
  )

  let pendingAction: PendingVoiceAction | null = opts.pendingAction ?? null

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await client.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: VOICE_TOOLS }],
        maxOutputTokens: 1024,
        abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    })

    const functionCalls = response.functionCalls
    if (!functionCalls || functionCalls.length === 0) {
      const text = response.text?.trim()
      return { replyText: text || "I'm here, but I didn't catch what to say — could you try again?", pendingAction }
    }

    const modelTurn = response.candidates?.[0]?.content
    if (modelTurn) contents.push(modelTurn)

    // Sequential, not Promise.all — these can be real mutations, and
    // running two of them concurrently within one turn is worth avoiding
    // even though the model rarely batches more than one mutating call.
    const parts = []
    for (const call of functionCalls as FunctionCall[]) {
      const name = call.name ?? ''
      const args = (call.args ?? {}) as Record<string, unknown>
      const output = await executeTool(name, call.args, opts.context, meta)
      pendingAction = deriveNextPendingAction(name, args, output, pendingAction)
      parts.push(createPartFromFunctionResponse(call.id ?? name ?? 'unknown', name || 'unknown', output))
    }
    contents.push({ role: 'user', parts })
  }

  return { replyText: "I've got a lot going on right now — could you ask that again in a moment?", pendingAction }
}

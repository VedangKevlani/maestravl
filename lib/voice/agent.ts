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
} from './tools'
import { executeGetItinerary, executeGetSegmentStatus, executeGetRecoveryActivity } from './toolExecutors'
import { buildSystemPrompt } from './systemPrompt'
import type { VoiceContext, VoiceTurnMessage } from './types'

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

function executeTool(name: string, rawArgs: unknown, context: VoiceContext): Record<string, unknown> {
  try {
    switch (name) {
      case 'get_itinerary':
        GetItineraryArgsSchema.parse(rawArgs)
        return executeGetItinerary(context)
      case 'get_segment_status':
        return executeGetSegmentStatus(context, GetSegmentStatusArgsSchema.parse(rawArgs))
      case 'get_recovery_activity':
        return executeGetRecoveryActivity(context, GetRecoveryActivityArgsSchema.parse(rawArgs))
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
}): Promise<{ replyText: string }> {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) // reads GEMINI_API_KEY at call time if omitted, but explicit is clearer here
  const systemInstruction = buildSystemPrompt(opts.context)

  const contents: Content[] = [
    ...opts.history.map((m): Content => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: opts.transcript }] },
  ]

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
      return { replyText: text || "I'm here, but I didn't catch what to say — could you try again?" }
    }

    const modelTurn = response.candidates?.[0]?.content
    if (modelTurn) contents.push(modelTurn)

    contents.push({
      role: 'user',
      parts: functionCalls.map((call: FunctionCall) => {
        const output = executeTool(call.name ?? '', call.args, opts.context)
        return createPartFromFunctionResponse(call.id ?? call.name ?? 'unknown', call.name ?? 'unknown', output)
      }),
    })
  }

  return { replyText: "I've got a lot going on right now — could you ask that again in a moment?" }
}

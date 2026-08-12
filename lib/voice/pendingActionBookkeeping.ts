// Pure — tracks which mutating tool call (if any) is still awaiting
// passenger confirmation across a runVoiceTurn's tool-calling loop. Kept
// separate from lib/voice/agent.ts (which is impure/untested) so this
// small but real piece of state logic is itself unit-tested.
import type { PendingVoiceAction } from './types'

/**
 * Rule: a "proposed" result replaces whatever was pending before (a new
 * proposal supersedes an old one the passenger never acted on); a
 * "confirm" attempt — successful or not — resolves/consumes the pending
 * action either way, since the passenger's decision has now been acted on
 * (or honestly failed); anything else (a read-only tool call, or a
 * propose-mode call that itself failed validation) leaves the existing
 * pending action untouched.
 */
export function deriveNextPendingAction(
  toolName: string,
  toolArgs: Record<string, unknown>,
  toolResult: Record<string, unknown>,
  previous: PendingVoiceAction | null
): PendingVoiceAction | null {
  if (toolResult.status === 'proposed') {
    return { toolName, toolArgs, toolResult }
  }
  if (toolArgs.mode === 'confirm' && (toolResult.status === 'executed' || toolResult.status === 'error')) {
    return null
  }
  return previous
}

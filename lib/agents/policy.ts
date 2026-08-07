// Authorization/risk policy — spec section 9. Every AgentAction is gated
// through here before it's allowed to execute; this is the boundary
// between "AI/deterministic logic proposes an action" and "the action
// actually happens" from spec section 18 — a proposal never skips this
// check on its way to execution.

import type { AgentActionType, RiskLevel } from '@/lib/constants'

/**
 * Extra facts about a specific action instance that push it into a higher
 * risk tier than its type's baseline — e.g. a reschedule that's free vs.
 * one that carries a fee, or a cancellation that's refundable vs. not.
 */
export interface ActionRiskContext {
  feeAmount?: number | null
  isNonRefundableCancellation?: boolean
  isBookingReplacement?: boolean
}

// Baseline risk per action type, per spec section 9's LOW list: notifying,
// requesting (not committing to) a change, updating Maestravl's own record
// of the itinerary, and reading/searching are all non-committal and safe
// to execute automatically. REQUEST_RESCHEDULE only asks for a new time —
// it doesn't accept a fee or lock anything in — so it's LOW at baseline;
// classifyActionRisk below escalates it once fee/cancellation context is
// known.
const BASELINE_RISK: Record<AgentActionType, RiskLevel> = {
  ANALYZE_IMPACT: 'LOW',
  FIND_CONTACT: 'LOW',
  CONTACT_PROVIDER: 'LOW',
  REQUEST_RESCHEDULE: 'LOW',
  VERIFY: 'LOW',
  UPDATE_ITINERARY: 'LOW',
  NOTIFY_PASSENGER: 'LOW',
  SEARCH_ALTERNATIVES: 'LOW',
  ESCALATE: 'LOW',
}

/**
 * Determines the actual risk tier for one action instance, factoring in
 * context a type's baseline can't capture — e.g. REQUEST_RESCHEDULE is LOW
 * when free but MEDIUM with a fee attached, and HIGH for a non-refundable
 * cancellation or a materially different replacement booking (spec
 * section 9's explicit HIGH examples).
 */
export function classifyActionRisk(type: AgentActionType, context: ActionRiskContext = {}): RiskLevel {
  if (context.isNonRefundableCancellation || context.isBookingReplacement) return 'HIGH'
  if (context.feeAmount && context.feeAmount > 0) return 'MEDIUM'
  return BASELINE_RISK[type]
}

/** LOW-risk actions execute automatically; anything else stops for approval. */
export function canAutoExecute(riskLevel: RiskLevel): boolean {
  return riskLevel === 'LOW'
}

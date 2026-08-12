import { describe, it, expect } from 'vitest'
import { decideRunTransition, type ReplyInterpretation } from './replyInterpretation'

function interpretation(overrides: Partial<ReplyInterpretation>): ReplyInterpretation {
  return { intent: 'UNCLEAR', confidence: 0, note: 'test', ...overrides }
}

describe('decideRunTransition', () => {
  it('moves to RESCHEDULING for a confident ACCEPTED reply when a reschedule was actually requested', () => {
    const result = decideRunTransition(interpretation({ intent: 'ACCEPTED', confidence: 90 }), true, 'Flight AA123')
    expect(result.status).toBe('RESCHEDULING')
    expect(result.summary).toContain('Flight AA123')
    expect(result.summary.toLowerCase()).toContain('confirm')
  })

  it('does not auto-confirm — RESCHEDULING still requires a passenger confirm step, never CONFIRMED directly', () => {
    const result = decideRunTransition(interpretation({ intent: 'ACCEPTED', confidence: 100 }), true, 'Flight AA123')
    expect(result.status).not.toBe('CONFIRMED')
  })

  it('stays ACTION_REQUIRED for a low-confidence ACCEPTED reply', () => {
    const result = decideRunTransition(interpretation({ intent: 'ACCEPTED', confidence: 40 }), true, 'Flight AA123')
    expect(result.status).toBe('ACTION_REQUIRED')
  })

  it('stays ACTION_REQUIRED for an ACCEPTED reply when no reschedule was actually requested (e.g. an awareness inquiry)', () => {
    const result = decideRunTransition(interpretation({ intent: 'ACCEPTED', confidence: 95 }), false, 'Flight AA123')
    expect(result.status).toBe('ACTION_REQUIRED')
  })

  it.each(['DECLINED', 'COUNTER_OFFER', 'UNCLEAR'] as const)('stays ACTION_REQUIRED for a %s reply regardless of confidence', (intent) => {
    const result = decideRunTransition(interpretation({ intent, confidence: 95 }), true, 'Flight AA123')
    expect(result.status).toBe('ACTION_REQUIRED')
  })

  it('flavors the summary by intent without ever overclaiming certainty', () => {
    const declined = decideRunTransition(interpretation({ intent: 'DECLINED', confidence: 90 }), true, 'Flight AA123')
    expect(declined.summary.toLowerCase()).toContain('looks like')

    const counter = decideRunTransition(interpretation({ intent: 'COUNTER_OFFER', confidence: 90 }), true, 'Flight AA123')
    expect(counter.summary.toLowerCase()).toContain('counter-offer')
  })
})

import { describe, it, expect } from 'vitest'
import { deriveNextPendingAction } from './pendingActionBookkeeping'
import type { PendingVoiceAction } from './types'

const PROPOSED: PendingVoiceAction = {
  toolName: 'report_delay',
  toolArgs: { mode: 'propose', segment: 'AA123', status: 'DELAYED' },
  toolResult: { status: 'proposed', summary: 'x', confirmationToken: 'tok-1' },
}

describe('deriveNextPendingAction', () => {
  it('a proposed result becomes the new pending action, replacing any previous one', () => {
    const next = deriveNextPendingAction('report_delay', PROPOSED.toolArgs, PROPOSED.toolResult, null)
    expect(next).toEqual(PROPOSED)
  })

  it('a new proposal supersedes an old still-pending one the passenger never acted on', () => {
    const older: PendingVoiceAction = { ...PROPOSED, toolArgs: { mode: 'propose', segment: 'BB456' } }
    const next = deriveNextPendingAction('report_delay', PROPOSED.toolArgs, PROPOSED.toolResult, older)
    expect(next).toEqual(PROPOSED)
  })

  it('a successful confirm resolves/clears the pending action', () => {
    const confirmArgs = { mode: 'confirm', confirmationToken: 'tok-1' }
    const executedResult = { status: 'executed' }
    const next = deriveNextPendingAction('report_delay', confirmArgs, executedResult, PROPOSED)
    expect(next).toBeNull()
  })

  it('a failed confirm also resolves/clears the pending action, not just a successful one', () => {
    const confirmArgs = { mode: 'confirm', confirmationToken: 'tok-1' }
    const errorResult = { status: 'error', error: 'expired' }
    const next = deriveNextPendingAction('report_delay', confirmArgs, errorResult, PROPOSED)
    expect(next).toBeNull()
  })

  it('an unrelated read-only tool call leaves an existing pending action untouched', () => {
    const next = deriveNextPendingAction('get_itinerary', {}, { trip: {} }, PROPOSED)
    expect(next).toEqual(PROPOSED)
  })

  it('a propose call that itself failed validation leaves any existing pending action untouched', () => {
    const proposeArgs = { mode: 'propose', segment: 'submarine' }
    const notFoundResult = { found: false, message: 'not found' }
    const next = deriveNextPendingAction('report_delay', proposeArgs, notFoundResult, PROPOSED)
    expect(next).toEqual(PROPOSED)
  })

  it('stays null when nothing is pending and nothing new was proposed', () => {
    const next = deriveNextPendingAction('get_itinerary', {}, { trip: {} }, null)
    expect(next).toBeNull()
  })
})

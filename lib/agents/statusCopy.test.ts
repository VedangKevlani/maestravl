import { describe, it, expect } from 'vitest'
import { AGENT_RUN_STATUSES, AGENT_ACTION_TYPES } from '@/lib/constants'
import { STATUS_COPY, ACTION_TYPE_LABEL } from './statusCopy'

describe('statusCopy exhaustiveness', () => {
  it('has a STATUS_COPY entry for every AgentRunStatus', () => {
    for (const status of AGENT_RUN_STATUSES) {
      expect(STATUS_COPY[status], `missing STATUS_COPY entry for ${status}`).toBeDefined()
    }
  })

  // VERIFY is deliberately excluded — see the comment above ACTION_TYPE_LABEL.
  it('has an ACTION_TYPE_LABEL entry for every AgentActionType except VERIFY', () => {
    for (const type of AGENT_ACTION_TYPES) {
      if (type === 'VERIFY') continue
      expect(ACTION_TYPE_LABEL[type], `missing ACTION_TYPE_LABEL entry for ${type}`).toBeDefined()
    }
  })
})

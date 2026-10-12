import { describe, it, expect } from 'vitest'
import { followUpTarget, FOLLOW_UP_AFTER_MS, type CommunicationLike } from './followUp'

const now = new Date('2026-10-12T18:00:00Z')
const longAgo = new Date(now.getTime() - FOLLOW_UP_AFTER_MS - 60_000)
const recently = new Date(now.getTime() - 60_000)

function outbound(id: string, sentAt: Date | null, status = 'SENT'): CommunicationLike {
  return { id, segmentId: 's1', direction: 'OUTBOUND', status, sentAt, createdAt: sentAt ?? now }
}

describe('followUpTarget', () => {
  it('targets the original request once it has gone unanswered long enough', () => {
    expect(followUpTarget([outbound('c1', longAgo)], now)?.id).toBe('c1')
  })

  it('waits until the threshold has passed', () => {
    expect(followUpTarget([outbound('c1', recently)], now)).toBeNull()
  })

  it('never follows up once the provider has replied', () => {
    const reply: CommunicationLike = { id: 'r1', segmentId: 's1', direction: 'INBOUND', status: 'DELIVERED', sentAt: null, createdAt: recently }
    expect(followUpTarget([outbound('c1', longAgo), reply], now)).toBeNull()
  })

  it('follows up at most once — a second outbound message means one was already sent or drafted', () => {
    expect(followUpTarget([outbound('c1', longAgo), outbound('c2', longAgo, 'DRAFTED')], now)).toBeNull()
    expect(followUpTarget([outbound('c1', longAgo), outbound('c2', longAgo)], now)).toBeNull()
  })

  it('ignores requests that were never actually sent', () => {
    expect(followUpTarget([outbound('c1', null, 'DRAFTED')], now)).toBeNull()
    expect(followUpTarget([outbound('c1', longAgo, 'FAILED')], now)).toBeNull()
  })
})

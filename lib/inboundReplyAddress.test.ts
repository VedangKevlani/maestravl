import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildReplyAddress, parseCommunicationIdFromAddress } from './inboundReplyAddress'

describe('buildReplyAddress', () => {
  const original = process.env.RESEND_INBOUND_DOMAIN

  afterEach(() => {
    process.env.RESEND_INBOUND_DOMAIN = original
  })

  it('returns null when RESEND_INBOUND_DOMAIN is not configured', () => {
    delete process.env.RESEND_INBOUND_DOMAIN
    expect(buildReplyAddress('abc123')).toBeNull()
  })

  it('builds a reply+<id>@<domain> address when configured', () => {
    process.env.RESEND_INBOUND_DOMAIN = 'abc123.resend.app'
    expect(buildReplyAddress('cmsmjw9z0005')).toBe('reply+cmsmjw9z0005@abc123.resend.app')
  })
})

describe('parseCommunicationIdFromAddress', () => {
  it('round-trips with buildReplyAddress', () => {
    process.env.RESEND_INBOUND_DOMAIN = 'abc123.resend.app'
    const address = buildReplyAddress('cmsmjw9z0005')!
    expect(parseCommunicationIdFromAddress(address)).toBe('cmsmjw9z0005')
  })

  it('returns null for addresses without the reply+ prefix', () => {
    expect(parseCommunicationIdFromAddress('hello@abc123.resend.app')).toBeNull()
    expect(parseCommunicationIdFromAddress('onboarding@resend.dev')).toBeNull()
  })

  it('returns null for malformed addresses', () => {
    expect(parseCommunicationIdFromAddress('not-an-email')).toBeNull()
    expect(parseCommunicationIdFromAddress('reply+@abc123.resend.app')).toBeNull()
  })
})

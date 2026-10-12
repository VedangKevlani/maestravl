import { describe, it, expect } from 'vitest'
import { evaluateBucket, clientIp, formatRetryAfter } from './rateLimit'

const rule = { limit: 3, windowMs: 15 * 60_000 }
const start = new Date('2026-10-12T10:00:00Z')

describe('evaluateBucket', () => {
  it('allows while under the limit inside the window', () => {
    expect(evaluateBucket(2, start, rule, new Date('2026-10-12T10:05:00Z'))).toEqual({ allowed: true, retryAfterSeconds: 0 })
  })

  it('blocks at the limit and says how long until the window resets', () => {
    expect(evaluateBucket(3, start, rule, new Date('2026-10-12T10:05:00Z'))).toEqual({ allowed: false, retryAfterSeconds: 600 })
  })

  it('allows again once the window has passed, whatever the old count', () => {
    expect(evaluateBucket(99, start, rule, new Date('2026-10-12T10:15:00Z')).allowed).toBe(true)
  })
})

describe('clientIp', () => {
  it("prefers Vercel's x-real-ip", () => {
    expect(clientIp(new Headers({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }))).toBe('1.2.3.4')
  })

  it('falls back to the first x-forwarded-for hop', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' }))).toBe('5.6.7.8')
  })

  it('ignores cf-connecting-ip, which the client controls when Cloudflare is not proxying', () => {
    expect(clientIp(new Headers({ 'cf-connecting-ip': '6.6.6.6' }))).toBe('unknown')
  })
})

describe('formatRetryAfter', () => {
  it('rounds up to whole minutes', () => {
    expect(formatRetryAfter(30)).toBe('a minute')
    expect(formatRetryAfter(601)).toBe('11 minutes')
  })
})

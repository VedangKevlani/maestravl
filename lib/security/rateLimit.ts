// Fixed-window rate limiting for public, abuse-prone endpoints (login,
// signup, password reset). Database-backed (RateLimitBucket) because
// Vercel's serverless instances share no memory — an in-process counter
// would reset on every cold start and differ per instance, so it would
// barely slow an attacker down. No Redis/KV is used: that would be a new
// service, and this app's free-tier Postgres already handles a few writes
// per login attempt comfortably.
//
// Fails OPEN on any database error (logged): a rate limiter outage must
// never lock every real user out of their account. The per-account limits
// still apply whenever the DB is healthy, which is the normal case.
import { prisma } from '@/lib/db'

export interface RateLimitRule {
  /** Max hits allowed within one window. */
  limit: number
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  /** Seconds until the current window resets — 0 when allowed. */
  retryAfterSeconds: number
}

// Login failures count per account (stops guessing one person's password)
// and per IP (stops one source spraying many accounts). Only *failed*
// attempts count, so a real user logging in normally is never affected.
export const LOGIN_FAILURES_PER_EMAIL: RateLimitRule = { limit: 8, windowMs: 15 * 60_000 }
export const LOGIN_FAILURES_PER_IP: RateLimitRule = { limit: 30, windowMs: 15 * 60_000 }
export const SIGNUPS_PER_IP: RateLimitRule = { limit: 5, windowMs: 60 * 60_000 }
// Password reset sends a real email (Resend free tier: 100/day shared with
// every other email this app sends), so this also protects that quota and
// stops anyone using the form to flood a victim's inbox.
export const RESET_REQUESTS_PER_IP: RateLimitRule = { limit: 5, windowMs: 60 * 60_000 }
export const RESET_REQUESTS_PER_EMAIL: RateLimitRule = { limit: 3, windowMs: 60 * 60_000 }

/** Pure — the decision for a bucket already read back from the database. */
export function evaluateBucket(count: number, windowStart: Date, rule: RateLimitRule, now: Date): RateLimitResult {
  const windowEnds = windowStart.getTime() + rule.windowMs
  if (windowEnds <= now.getTime()) return { allowed: true, retryAfterSeconds: 0 }
  if (count < rule.limit) return { allowed: true, retryAfterSeconds: 0 }
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowEnds - now.getTime()) / 1000)) }
}

/** Is this key already over its limit? Does not count as a hit. */
export async function checkRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  try {
    const bucket = await prisma.rateLimitBucket.findUnique({ where: { key } })
    if (!bucket) return { allowed: true, retryAfterSeconds: 0 }
    return evaluateBucket(bucket.count, bucket.windowStart, rule, new Date())
  } catch (err) {
    console.error('[rateLimit] check failed, allowing request', err)
    return { allowed: true, retryAfterSeconds: 0 }
  }
}

/**
 * Records one hit and reports whether the caller was still within its
 * limit *before* this hit. A single atomic upsert — two concurrent
 * requests can't both read a stale count and slip past the limit.
 */
export async function hitRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  try {
    const now = new Date()
    const windowCutoff = new Date(now.getTime() - rule.windowMs)
    const rows = await prisma.$queryRaw<{ count: number; windowStart: Date }[]>`
      INSERT INTO "RateLimitBucket" ("key", "count", "windowStart", "updatedAt")
      VALUES (${key}, 1, ${now}, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."windowStart" <= ${windowCutoff} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "windowStart" = CASE WHEN "RateLimitBucket"."windowStart" <= ${windowCutoff} THEN ${now} ELSE "RateLimitBucket"."windowStart" END,
        "updatedAt" = ${now}
      RETURNING "count", "windowStart"
    `
    const row = rows[0]
    if (!row) return { allowed: true, retryAfterSeconds: 0 }
    // count already includes this hit, so "within limit before this hit"
    // means the count *before* it (count - 1) was still under the limit.
    return evaluateBucket(Number(row.count) - 1, new Date(row.windowStart), rule, now)
  } catch (err) {
    console.error('[rateLimit] hit failed, allowing request', err)
    return { allowed: true, retryAfterSeconds: 0 }
  }
}

/** Removes buckets whose window ended long ago — called from the monitoring cron. */
export async function sweepExpiredRateLimits(olderThanMs = 24 * 60 * 60_000): Promise<number> {
  try {
    const { count } = await prisma.rateLimitBucket.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - olderThanMs) } } })
    return count
  } catch (err) {
    console.error('[rateLimit] sweep failed', err)
    return 0
  }
}

/**
 * The caller's IP as Vercel reports it. Vercel sets x-real-ip and
 * overwrites x-forwarded-for itself, so neither can be forged by the
 * client. cf-connecting-ip is deliberately NOT trusted: maestravl.com's
 * Cloudflare DNS is not proxied (confirmed 2026-10-12 — responses carry no
 * cf-ray header), so that header would arrive straight from the client and
 * let anyone pick their own "IP". Revisit if Cloudflare proxying is enabled.
 */
export function clientIp(headers: Headers): string {
  const real = headers.get('x-real-ip')?.trim()
  if (real) return real
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || 'unknown'
}

export function formatRetryAfter(seconds: number): string {
  const minutes = Math.ceil(seconds / 60)
  return minutes <= 1 ? 'a minute' : `${minutes} minutes`
}

// The assistant spends from one shared free Groq quota — 1,000 requests/day
// and 8,000 tokens/minute per model, ~3 calls per turn (lib/voice/agent.ts).
// A per-user cap stops one account from exhausting it for everyone.
export const VOICE_TURNS_PER_USER: RateLimitRule = { limit: 40, windowMs: 10 * 60_000 }

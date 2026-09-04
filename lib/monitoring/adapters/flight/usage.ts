import { prisma } from '@/lib/db'

// Used as the reset estimate for a provider that hasn't told us its real
// window boundary yet (i.e. no rate-limit header available/seen) — a
// reasonable guess, but see refreshResetAt for providers that report one.
//
// Deliberately short (24h), not a full calendar month: a *guessed* resetAt
// this file itself set can otherwise never self-correct. Once `getUsedUnits`
// reports "exhausted," the adapter rotator (flightAdapter.ts) skips this
// provider entirely and never calls it again — so refreshResetAt (which
// only runs after a real, successful call) never gets a chance to learn the
// provider's actual reset window. Found live 2026-09: a genuinely-used-up
// month reset a guessed resetAt to a full month out, and the real account
// refilled with real headroom weeks before that guess did — but the app had
// no way to find out, since it had stopped asking. Capping the guess at 24h
// means the worst case is one wasted probe a day, not an indefinite
// deadlock; a provider that actually reports its window (refreshResetAt)
// still overrides this with the real value regardless.
function guessedResetBoundary(): Date {
  return new Date(Date.now() + 24 * 60 * 60 * 1000)
}

export async function getUsedUnits(provider: string): Promise<number> {
  const row = await prisma.providerUsage.findUnique({ where: { provider } })
  if (!row) return 0
  return row.resetAt > new Date() ? row.units : 0
}

/**
 * Called before every real request — counts the attempt whether or not it
 * succeeds, since providers bill on requests made, not on results parsed.
 * Rolls the window over (resets the count to just this call) if the
 * previously recorded resetAt has already passed.
 */
export async function recordUsage(provider: string, units: number): Promise<void> {
  const existing = await prisma.providerUsage.findUnique({ where: { provider } })
  const expired = !existing || existing.resetAt <= new Date()

  await prisma.providerUsage.upsert({
    where: { provider },
    create: { provider, units, resetAt: guessedResetBoundary() },
    update: expired ? { units, resetAt: guessedResetBoundary() } : { units: { increment: units } },
  })
}

/**
 * Called after a successful call when the provider reports its own
 * rate-limit reset (e.g. AeroDataBox's `X-RateLimit-API-Units-Reset`
 * header, confirmed to be a rolling ~31-day window rather than calendar
 * month) — replaces the calendar-month guess with the provider's actual
 * window boundary so we don't think quota is available before it really is.
 */
export async function refreshResetAt(provider: string, resetSeconds: number): Promise<void> {
  await prisma.providerUsage.updateMany({
    where: { provider },
    data: { resetAt: new Date(Date.now() + resetSeconds * 1000) },
  })
}

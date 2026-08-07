import type { MonitorableSegment, MonitoringAdapter, MonitoringCheckResult } from '../types'
import type { FlightProviderAdapter } from './flight/types'
import { aviationStackAdapter } from './flight/aviationStack'
import { aeroDataBoxAdapter } from './flight/aeroDataBox'
import { getUsedUnits, recordUsage, refreshResetAt } from './flight/usage'

// Tried in priority order, but only falls through to the next provider when
// the current one has nothing to offer for this exact trip: its quota for
// this window is exhausted, or it responded successfully but had no data
// for this exact date (result.noMatch — e.g. a provider that only carries
// near-term schedules). A hard failure (network error, bad response) is
// reported as its own result rather than retried against a different
// provider — mixing providers for the same check otherwise risks one of
// them matching a different day's occurrence of a recurring flight number
// and reporting the wrong status for this trip.
const PROVIDERS: FlightProviderAdapter[] = [aviationStackAdapter, aeroDataBoxAdapter]

export const flightAdapter: MonitoringAdapter = {
  id: 'flight-adapter-v1',
  supports: ['FLIGHT'],
  isConfigured() {
    return PROVIDERS.some((p) => p.isConfigured())
  },
  buildTrackingKey(segment: MonitorableSegment) {
    return PROVIDERS.find((p) => p.isConfigured())?.buildTrackingKey(segment) ?? null
  },
  async check(segment: MonitorableSegment): Promise<MonitoringCheckResult> {
    let lastNoMatch: MonitoringCheckResult | null = null
    let effectiveSegment = segment

    for (const provider of PROVIDERS) {
      if (!provider.isConfigured()) continue

      const used = await getUsedUnits(provider.id)
      if (used + provider.unitsPerCall > provider.monthlyQuota) continue // out of quota — move to the next provider

      // Recorded before the call resolves — a provider counts an attempted
      // request against quota whether or not it errors out.
      await recordUsage(provider.id, provider.unitsPerCall)
      try {
        const result = await provider.check(effectiveSegment)
        if (result.quotaResetSeconds) {
          await refreshResetAt(provider.id, result.quotaResetSeconds)
        }
        if (result.noMatch) {
          // This provider is healthy but just doesn't carry this date —
          // remember it and give the next provider a shot.
          lastNoMatch = { ...result, provider: provider.id }
          // A codeshare's marketing number may not be what the next
          // provider indexes — if this one revealed the operating
          // carrier's own number, switch to it for the rest of the loop.
          if (result.operatingIdentifier && result.operatingIdentifier !== effectiveSegment.identifier) {
            effectiveSegment = { ...effectiveSegment, identifier: result.operatingIdentifier }
          }
          continue
        }
        return { ...result, provider: provider.id }
      } catch (err) {
        // A non-quota, non-noMatch failure (network error, bad response) is
        // reported as-is — it does NOT fall through to the next provider.
        return {
          status: 'UNKNOWN',
          message: err instanceof Error ? err.message : `${provider.id} request failed`,
          checkedAt: new Date(),
          provider: provider.id,
        }
      }
    }

    if (lastNoMatch) return lastNoMatch

    return {
      status: 'UNKNOWN',
      message: 'All configured flight-status providers have used up their free-tier quota for this window, or none are configured.',
      checkedAt: new Date(),
    }
  },
}

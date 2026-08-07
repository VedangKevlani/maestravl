import type { MonitorableSegment, MonitoringAdapter, MonitoringCheckResult } from '../types'
import type { FlightProviderAdapter } from './flight/types'
import { aviationStackAdapter } from './flight/aviationStack'
import { aeroDataBoxAdapter } from './flight/aeroDataBox'
import { getUsedUnits, recordUsage, refreshResetAt } from './flight/usage'

// Tried in priority order; the first configured provider that still has
// free-tier budget left in its current window wins. When one runs dry (or
// errors), later checks fall straight through to the next one — see
// docs/INTEGRATION.md for the combined-budget math. Add more providers
// here as they're wired up; nothing else in the monitoring pipeline needs
// to change.
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
    for (const provider of PROVIDERS) {
      if (!provider.isConfigured()) continue

      const used = await getUsedUnits(provider.id)
      if (used + provider.unitsPerCall > provider.monthlyQuota) continue

      // Recorded before the call resolves — a provider counts an attempted
      // request against quota whether or not it errors out.
      await recordUsage(provider.id, provider.unitsPerCall)
      try {
        const result = await provider.check(segment)
        if (result.quotaResetSeconds) {
          await refreshResetAt(provider.id, result.quotaResetSeconds)
        }
        return { ...result, provider: provider.id }
      } catch {
        continue // this provider is having a bad day — try the next one
      }
    }

    return {
      status: 'UNKNOWN',
      message: 'All configured flight-status providers have used up their free-tier quota for this window, or none are configured.',
      checkedAt: new Date(),
    }
  },
}

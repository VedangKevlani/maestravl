import type { MonitoringAdapter } from '../../types'

/**
 * A flight-status provider usable by the rotator in ../flightAdapter.ts.
 * `monthlyQuota` and `unitsPerCall` are both expressed in whatever unit the
 * provider bills in (AviationStack: 1 request = 1 unit; AeroDataBox:
 * requests cost a variable number of "API units") so the rotator can budget
 * accurately across providers with different pricing models.
 */
export interface FlightProviderAdapter extends MonitoringAdapter {
  monthlyQuota: number
  unitsPerCall: number
}

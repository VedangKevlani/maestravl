import type { TransportType } from '@/lib/constants'

export type MonitoringCheckStatus =
  | 'ON_TIME' | 'DELAYED' | 'CANCELLED' | 'BOARDING' | 'DEPARTED' | 'ARRIVED' | 'UNKNOWN'

export interface MonitoringCheckResult {
  status: MonitoringCheckStatus
  delayMinutes?: number
  gate?: string
  terminal?: string
  message?: string
  raw?: unknown
  checkedAt: Date
  /** Which underlying provider actually answered this check — set by adapters (like the flight rotator) that can be backed by more than one API. */
  provider?: string
  /** Seconds until this provider's own rate-limit window resets, when it reports one (e.g. via a response header) — lets usage tracking use the provider's real window instead of a calendar-month guess. */
  quotaResetSeconds?: number
}

export interface MonitorableSegment {
  id: string
  transportType: TransportType
  provider: string | null
  identifier: string | null
  departureLocationCode: string | null
  arrivalLocationCode: string | null
  departureTime: Date | null
}

/**
 * Every transport type gets one adapter behind this same interface. New
 * providers (a real flight-status API, a rail operator feed, etc.) are
 * plug-and-play: implement this interface and register it — nothing else
 * in the app needs to change.
 */
export interface MonitoringAdapter {
  /** Stable id stored on MonitoringRecord.apiProvider, e.g. "flight-adapter-v1". */
  readonly id: string
  readonly supports: TransportType[]
  /** True once real credentials/config for an upstream provider are present. */
  isConfigured(): boolean
  /** Builds the provider-specific key used to look up this segment upstream, or null if insufficient data. */
  buildTrackingKey(segment: MonitorableSegment): string | null
  /** Queries the upstream provider. Adapters that are not configured resolve with status 'UNKNOWN'. */
  check(segment: MonitorableSegment): Promise<MonitoringCheckResult>
}

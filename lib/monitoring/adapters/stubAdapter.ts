import type { TransportType } from '@/lib/constants'
import type { MonitoringAdapter, MonitorableSegment, MonitoringCheckResult } from '../types'

/**
 * Shared scaffold for a not-yet-connected monitoring adapter. Every
 * transport type gets one of these until a real upstream provider is wired
 * up — see docs/INTEGRATION.md for realistic free/low-cost options per mode.
 */
export function createStubAdapter(opts: {
  id: string
  supports: TransportType[]
  envVar: string
  buildTrackingKey: (segment: MonitorableSegment) => string | null
}): MonitoringAdapter {
  return {
    id: opts.id,
    supports: opts.supports,
    isConfigured() {
      return Boolean(process.env[opts.envVar])
    },
    buildTrackingKey: opts.buildTrackingKey,
    async check(segment: MonitorableSegment): Promise<MonitoringCheckResult> {
      if (!this.isConfigured()) {
        return {
          status: 'UNKNOWN',
          message: `${opts.id} is not connected yet — set ${opts.envVar} to enable live checks.`,
          checkedAt: new Date(),
        }
      }
      // A real provider integration goes here once envVar is set. Until then,
      // configured-but-unimplemented adapters intentionally still report UNKNOWN
      // rather than fabricating a status.
      void segment
      return { status: 'UNKNOWN', message: 'Not implemented', checkedAt: new Date() }
    },
  }
}

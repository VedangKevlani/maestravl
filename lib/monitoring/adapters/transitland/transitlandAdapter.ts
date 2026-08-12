import type { MonitorableSegment, MonitoringAdapter, MonitoringCheckResult } from '../../types'
import type { TransportType } from '@/lib/constants'
import { getUsedUnits, recordUsage } from '../flight/usage'
import { isTransitlandConfigured, searchOperators, searchRoutes } from './client'
import { pickBestOperatorMatch, pickBestRouteMatch, classifyAlerts } from './matching'

const PROVIDER_ID = 'transitland'
const MONTHLY_QUOTA = 10000
const UNITS_PER_CHECK = 2 // one operator search + one route search

function buildSearchText(segment: MonitorableSegment): { operatorQuery: string; routeQuery: string } | null {
  if (!segment.provider || !segment.identifier) return null
  return { operatorQuery: segment.provider, routeQuery: segment.identifier }
}

/**
 * Factory for the TRAIN and BUS adapters — both are the same Transitland
 * lookup, parameterized only by which GTFS route_type to filter for. Mirrors
 * the shape of lib/monitoring/adapters/flightAdapter.ts (honest noMatch
 * degradation, quota tracked via the same ProviderUsage table/helpers used
 * for flights, a hard error terminates the check rather than being
 * swallowed) even though there's only one provider here, not a multi-provider
 * rotation — see docs/ARCHITECTURE.md's "Monitoring abstraction" section.
 */
export function createTransitlandAdapter(opts: { id: string; supports: TransportType[]; gtfsRouteType: number }): MonitoringAdapter {
  return {
    id: opts.id,
    supports: opts.supports,
    isConfigured: isTransitlandConfigured,
    buildTrackingKey(segment) {
      const search = buildSearchText(segment)
      if (!search) return null
      return `${search.operatorQuery}:${search.routeQuery}`.toLowerCase()
    },
    async check(segment: MonitorableSegment): Promise<MonitoringCheckResult> {
      const search = buildSearchText(segment)
      if (!search) {
        return {
          status: 'UNKNOWN',
          noMatch: true,
          message: 'Add the operator name and train/bus number to this segment (Edit) for Maestravl to look up live status.',
          checkedAt: new Date(),
        }
      }

      if (!isTransitlandConfigured()) {
        return { status: 'UNKNOWN', message: `${opts.id} is not connected yet — set TRANSITLAND_API_KEY to enable live checks.`, checkedAt: new Date() }
      }

      const used = await getUsedUnits(PROVIDER_ID)
      if (used + UNITS_PER_CHECK > MONTHLY_QUOTA) {
        return { status: 'UNKNOWN', message: 'Transitland free-tier quota exhausted for this window.', checkedAt: new Date() }
      }

      try {
        await recordUsage(PROVIDER_ID, UNITS_PER_CHECK)

        const operators = await searchOperators(search.operatorQuery)
        const operator = pickBestOperatorMatch(operators, search.operatorQuery)
        if (!operator) {
          return {
            status: 'UNKNOWN',
            noMatch: true,
            message: `Couldn't find "${search.operatorQuery}" as a known transit operator.`,
            checkedAt: new Date(),
          }
        }

        const routes = await searchRoutes(operator.onestop_id, search.routeQuery, opts.gtfsRouteType)
        const route = pickBestRouteMatch(routes, search.routeQuery)
        if (!route) {
          return {
            status: 'UNKNOWN',
            noMatch: true,
            message: `Couldn't find route/train "${search.routeQuery}" for ${search.operatorQuery}.`,
            checkedAt: new Date(),
          }
        }

        const classification = classifyAlerts(route.alerts)
        return {
          status: classification.status,
          delayMinutes: classification.delayMinutes,
          message: classification.message,
          checkedAt: new Date(),
          raw: route,
        }
      } catch (err) {
        return {
          status: 'UNKNOWN',
          message: err instanceof Error ? err.message : `${opts.id} request failed`,
          checkedAt: new Date(),
        }
      }
    },
  }
}

// Impure REST client for the Transitland v2 API (https://transit.land) — a
// free-tier (10,000 REST queries/month, confirmed at
// https://www.transit.land/plans-pricing/) aggregator of GTFS +
// GTFS-realtime data for 55+ countries, used here as the sole provider for
// TRAIN/BUS monitoring (see ../transitlandAdapter.ts). No AbortSignal/
// timeout, matching the existing flight providers' convention
// (lib/monitoring/adapters/flight/{aviationStack,aeroDataBox}.ts) — a hung
// request surfaces as a thrown error the caller already handles.
import type { TransitlandOperator, TransitlandRoute } from './matching'

const BASE_URL = 'https://transit.land/api/v2/rest'
export const ENV_VAR = 'TRANSITLAND_API_KEY'

export function isTransitlandConfigured(): boolean {
  return Boolean(process.env[ENV_VAR])
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const apiKey = process.env[ENV_VAR]
  if (!apiKey) throw new Error('TRANSITLAND_API_KEY is not configured')

  const url = new URL(`${BASE_URL}${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

  const res = await fetch(url, { headers: { apikey: apiKey } })
  if (!res.ok) {
    throw new Error(`Transitland request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export async function searchOperators(query: string): Promise<TransitlandOperator[]> {
  const data = await get<{ operators: TransitlandOperator[] }>('/operators', { search: query, limit: '10' })
  return data.operators ?? []
}

/**
 * route_type follows the GTFS spec: 2 = rail, 3 = bus (see
 * https://gtfs.org/documentation/schedule/reference/#routestxt) — a
 * best-effort filter, not exhaustive (e.g. won't catch a subway/monorail
 * filed under TRAIN). Transitland's docs list both `route_type` and
 * `route_types` as accepted filter params without specifying which takes a
 * single value vs a list; `route_type` (singular) is used here since this
 * call always filters to exactly one — worth confirming against a live
 * response once a real API key is available (see docs/INTEGRATION.md).
 */
export async function searchRoutes(operatorOnestopId: string, query: string, routeType: number): Promise<TransitlandRoute[]> {
  const data = await get<{ routes: TransitlandRoute[] }>('/routes', {
    operator_onestop_id: operatorOnestopId,
    search: query,
    route_type: String(routeType),
    include_alerts: 'true',
    limit: '10',
  })
  return data.routes ?? []
}

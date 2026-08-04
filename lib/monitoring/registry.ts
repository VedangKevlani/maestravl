import type { TransportType } from '@/lib/constants'
import type { MonitoringAdapter } from './types'
import { flightAdapter } from './adapters/flightAdapter'
import { trainAdapter } from './adapters/trainAdapter'
import { busAdapter } from './adapters/busAdapter'
import { boatAdapter } from './adapters/boatAdapter'
import { taxiAdapter } from './adapters/taxiAdapter'

/**
 * Plug-and-play registry: adding a new provider means writing one adapter
 * (see adapters/stubAdapter.ts for the shared scaffold) and listing it here.
 * Nothing else in the monitoring pipeline needs to change.
 */
const ADAPTERS: MonitoringAdapter[] = [flightAdapter, trainAdapter, busAdapter, boatAdapter, taxiAdapter]

export function getAdapterForTransportType(type: TransportType): MonitoringAdapter | null {
  return ADAPTERS.find((a) => a.supports.includes(type)) ?? null
}

export function listAdapters(): MonitoringAdapter[] {
  return ADAPTERS
}

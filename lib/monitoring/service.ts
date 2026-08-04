import { prisma } from '@/lib/db'
import { getAdapterForTransportType } from './registry'
import type { MonitorableSegment } from './types'
import type { TransportType } from '@/lib/constants'

/** Called right after a segment is saved — sets up (or refreshes) its MonitoringRecord. */
export async function initializeMonitoringForSegment(segmentId: string) {
  const segment = await prisma.segment.findUnique({ where: { id: segmentId } })
  if (!segment) return null

  const adapter = getAdapterForTransportType(segment.transportType as TransportType)
  const monitorable: MonitorableSegment = {
    id: segment.id,
    transportType: segment.transportType as TransportType,
    provider: segment.provider,
    identifier: segment.identifier,
    departureLocationCode: segment.departureLocationCode,
    arrivalLocationCode: segment.arrivalLocationCode,
    departureTime: segment.departureTime,
  }

  const trackingKey = adapter?.buildTrackingKey(monitorable) ?? null
  const configured = Boolean(adapter?.isConfigured())

  return prisma.monitoringRecord.upsert({
    where: { segmentId },
    create: {
      segmentId,
      apiProvider: adapter?.id ?? null,
      trackingKey,
      status: configured ? 'ACTIVE' : 'NOT_CONFIGURED',
    },
    update: {
      apiProvider: adapter?.id ?? null,
      trackingKey,
      status: configured ? 'ACTIVE' : 'NOT_CONFIGURED',
    },
  })
}

export async function runMonitoringCheck(segmentId: string) {
  const segment = await prisma.segment.findUnique({ where: { id: segmentId } })
  if (!segment) throw new Error('Segment not found')

  const adapter = getAdapterForTransportType(segment.transportType as TransportType)
  if (!adapter) {
    return prisma.monitoringRecord.upsert({
      where: { segmentId },
      create: { segmentId, status: 'NOT_CONFIGURED' },
      update: { status: 'NOT_CONFIGURED' },
    })
  }

  const monitorable: MonitorableSegment = {
    id: segment.id,
    transportType: segment.transportType as TransportType,
    provider: segment.provider,
    identifier: segment.identifier,
    departureLocationCode: segment.departureLocationCode,
    arrivalLocationCode: segment.arrivalLocationCode,
    departureTime: segment.departureTime,
  }

  const result = await adapter.check(monitorable)
  const nextCheckAt = new Date(Date.now() + 1000 * 60 * 30) // re-check in 30 min by default

  return prisma.monitoringRecord.upsert({
    where: { segmentId },
    create: {
      segmentId,
      apiProvider: adapter.id,
      trackingKey: adapter.buildTrackingKey(monitorable),
      status: adapter.isConfigured() ? 'ACTIVE' : 'NOT_CONFIGURED',
      lastCheckedAt: result.checkedAt,
      nextCheckAt,
      lastKnownData: JSON.stringify(result),
    },
    update: {
      status: adapter.isConfigured() ? 'ACTIVE' : 'NOT_CONFIGURED',
      lastCheckedAt: result.checkedAt,
      nextCheckAt,
      lastKnownData: JSON.stringify(result),
    },
  })
}

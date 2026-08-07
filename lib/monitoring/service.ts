import { prisma } from '@/lib/db'
import { sendStatusChangeEmail } from '@/lib/email'
import { getAdapterForTransportType } from './registry'
import type { MonitorableSegment, MonitoringCheckResult } from './types'
import type { TransportType } from '@/lib/constants'

// AviationStack's free tier caps out at 100 requests/month total — a 30min
// interval alone burns ~1,440/month for a single segment. 6h keeps a single
// segment to ~120/month; multiple concurrently-monitored segments will still
// need a paid plan. See docs/INTEGRATION.md.
const CHECK_INTERVAL_MS = 1000 * 60 * 60 * 6

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

  const record = await prisma.monitoringRecord.upsert({
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

  // Seed a real reading immediately rather than leaving it null until the
  // next scheduled check (up to 6h away) — segment creation is exactly when
  // a user expects to see current status, not much later.
  if (configured) {
    return runMonitoringCheck(segmentId)
  }
  return record
}

function segmentLabel(segment: { identifier: string | null; provider: string | null; departureLocationCode: string | null; arrivalLocationCode: string | null }) {
  const name = segment.identifier || segment.provider || 'Your trip segment'
  const route = segment.departureLocationCode && segment.arrivalLocationCode
    ? ` (${segment.departureLocationCode} → ${segment.arrivalLocationCode})`
    : ''
  return `${name}${route}`
}

/** Emails every passenger on the segment about a status change and logs the attempt(s). */
async function notifyPassengersOfStatusChange(segmentId: string, previousStatus: string | null, newStatus: string) {
  const segment = await prisma.segment.findUnique({
    where: { id: segmentId },
    include: {
      trip: true,
      passengerLinks: { include: { passenger: true } },
    },
  })
  if (!segment) return

  const label = segmentLabel(segment)
  const recipients = segment.passengerLinks.map((link) => link.passenger).filter((p) => p.email)

  if (recipients.length === 0) {
    await prisma.notificationLog.create({
      data: {
        tripId: segment.tripId,
        segmentId: segment.id,
        previousStatus,
        newStatus,
        channel: 'NONE',
        success: false,
        errorMessage: 'No passenger email on file',
      },
    })
    return
  }

  for (const passenger of recipients) {
    try {
      const subject = await sendStatusChangeEmail(passenger.email!, {
        recipientName: passenger.name,
        segmentLabel: label,
        tripTitle: segment.trip.title,
        previousStatus,
        newStatus,
      })
      await prisma.notificationLog.create({
        data: {
          tripId: segment.tripId,
          segmentId: segment.id,
          previousStatus,
          newStatus,
          channel: 'EMAIL',
          recipientEmail: passenger.email,
          recipientName: passenger.name,
          subject,
          success: true,
        },
      })
    } catch (err) {
      await prisma.notificationLog.create({
        data: {
          tripId: segment.tripId,
          segmentId: segment.id,
          previousStatus,
          newStatus,
          channel: 'EMAIL',
          recipientEmail: passenger.email,
          recipientName: passenger.name,
          success: false,
          errorMessage: err instanceof Error ? err.message : 'Failed to send notification',
        },
      })
    }
  }
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

  const existing = await prisma.monitoringRecord.findUnique({ where: { segmentId } })
  let previousStatus: string | null = null
  if (existing?.lastKnownData) {
    try {
      previousStatus = (JSON.parse(existing.lastKnownData) as MonitoringCheckResult).status ?? null
    } catch {
      previousStatus = null
    }
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
  const nextCheckAt = new Date(Date.now() + CHECK_INTERVAL_MS)

  const record = await prisma.monitoringRecord.upsert({
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

  // Only notify once we have a genuine prior reading to compare against —
  // otherwise the very first check would "change" from nothing to something.
  if (previousStatus && result.status !== previousStatus && result.status !== 'UNKNOWN') {
    await notifyPassengersOfStatusChange(segmentId, previousStatus, result.status)
  }

  return record
}

/**
 * Runs checks for every actively-monitored segment whose nextCheckAt has
 * passed. Meant to be called on a schedule (see app/api/cron/monitoring) —
 * sequential rather than parallel to stay gentle on rate-limited free-tier
 * provider quotas.
 */
export async function runDueMonitoringChecks() {
  const due = await prisma.monitoringRecord.findMany({
    where: {
      status: 'ACTIVE',
      OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: new Date() } }],
    },
    select: { segmentId: true },
  })

  const results: { segmentId: string; ok: boolean; error?: string }[] = []
  for (const { segmentId } of due) {
    try {
      await runMonitoringCheck(segmentId)
      results.push({ segmentId, ok: true })
    } catch (err) {
      results.push({ segmentId, ok: false, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }
  return results
}

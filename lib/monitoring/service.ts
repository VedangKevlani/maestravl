import { prisma } from '@/lib/db'
import { sendStatusChangeEmail } from '@/lib/email'
import { getAdapterForTransportType } from './registry'
import { handleDisruptionDetection } from '@/lib/agents/detect'
import { segmentLabel } from '@/lib/segmentLabel'
import type { MonitorableSegment, MonitoringCheckResult, MonitoringCheckStatus } from './types'
import type { TransportType } from '@/lib/constants'

// AviationStack's free tier caps out at 100 requests/month total, so polling
// scales with proximity to departure instead of a flat interval: most of a
// segment's monitored life is spent far from departure, where a status
// change is unlikely and cheap polling is fine; the hours right around
// departure — where a delay/cancellation is both most likely and most
// urgent to catch — get checked much more often. See docs/INTEGRATION.md
// for the budget math.
const FAR_INTERVAL_MS = 1000 * 60 * 60 * 12 // >72h to departure
const NEAR_INTERVAL_MS = 1000 * 60 * 60 * 6 // 24-72h to departure
const SOON_INTERVAL_MS = 1000 * 60 * 60 * 2 // 6-24h to departure
const IMMINENT_INTERVAL_MS = 1000 * 60 * 30 // <=6h to departure, and in-flight

// Once a segment has reached a terminal status it stops costing quota
// immediately. But a provider that never confirms ARRIVED at all (e.g. it
// simply doesn't have this flight in its data — see the "noMatch" path in
// lib/monitoring/adapters/flight/aeroDataBox.ts) would otherwise poll
// forever, so there's also a time-based fallback: stop asking once we're
// well past when the segment must be over, confirmation or not. Measured
// from the *arrival* time when it's known (tightest, most honest signal —
// a few hours past scheduled arrival covers realistic delays without
// pointlessly checking into the next day for a flight that already
// landed) and falls back to a wider window from departure when arrival
// isn't known, since departure alone can't tell us how long the segment
// actually takes.
const STALE_AFTER_ARRIVAL_MS = 1000 * 60 * 60 * 3
const STALE_AFTER_DEPARTURE_MS = 1000 * 60 * 60 * 8

function computeCheckIntervalMs(departureTime: Date | null): number {
  if (!departureTime) return NEAR_INTERVAL_MS
  const msToDeparture = departureTime.getTime() - Date.now()
  if (msToDeparture <= 1000 * 60 * 60 * 6) return IMMINENT_INTERVAL_MS
  if (msToDeparture <= 1000 * 60 * 60 * 24) return SOON_INTERVAL_MS
  if (msToDeparture <= 1000 * 60 * 60 * 72) return NEAR_INTERVAL_MS
  return FAR_INTERVAL_MS
}

function isMonitoringComplete(status: MonitoringCheckStatus, departureTime: Date | null, arrivalTime: Date | null) {
  if (status === 'ARRIVED' || status === 'CANCELLED') return true
  if (arrivalTime) return Date.now() - arrivalTime.getTime() > STALE_AFTER_ARRIVAL_MS
  return Boolean(departureTime && Date.now() - departureTime.getTime() > STALE_AFTER_DEPARTURE_MS)
}

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
    arrivalTime: segment.arrivalTime,
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

export { segmentLabel }

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
    arrivalTime: segment.arrivalTime,
  }

  const result = await adapter.check(monitorable)
  const nextCheckAt = new Date(Date.now() + computeCheckIntervalMs(segment.departureTime))
  const status = !adapter.isConfigured()
    ? 'NOT_CONFIGURED'
    : isMonitoringComplete(result.status, segment.departureTime, segment.arrivalTime)
      ? 'PAUSED'
      : 'ACTIVE'

  const record = await prisma.monitoringRecord.upsert({
    where: { segmentId },
    create: {
      segmentId,
      apiProvider: adapter.id,
      trackingKey: adapter.buildTrackingKey(monitorable),
      status,
      lastCheckedAt: result.checkedAt,
      nextCheckAt,
      lastKnownData: JSON.stringify(result),
    },
    update: {
      status,
      lastCheckedAt: result.checkedAt,
      nextCheckAt,
      lastKnownData: JSON.stringify(result),
    },
  })

  // Only notify once we have a genuine prior reading to compare against —
  // otherwise the very first check would "change" from nothing to something.
  // ARRIVED is deliberately silent — landing isn't actionable or urgent for
  // the passenger to hear about by email, and this segment's monitoring is
  // about to pause anyway (see isMonitoringComplete above), so there's
  // nothing further to report on it either.
  if (previousStatus && result.status !== previousStatus && result.status !== 'UNKNOWN' && result.status !== 'ARRIVED') {
    await notifyPassengersOfStatusChange(segmentId, previousStatus, result.status)
    // Disruptive changes (a real delay or a cancellation) additionally
    // start a recovery AgentRun — see lib/agents/detect.ts. Routine
    // progression (BOARDING/DEPARTED/back to ON_TIME) is already covered by
    // the notification above and isn't disruptive on its own.
    await handleDisruptionDetection(segment, previousStatus, result)
  }

  return record
}

/**
 * Runs checks for every actively-monitored segment whose nextCheckAt has
 * passed. Meant to be called on a schedule (see app/api/cron/monitoring) —
 * sequential rather than parallel to stay gentle on rate-limited free-tier
 * provider quotas.
 *
 * Ordered by departure time (soonest first) rather than insertion order —
 * when a run's combined provider quota is tight, whichever segment is
 * closest to departure gets checked before one that's still days out,
 * instead of losing out to whatever happened to be created first.
 */
export async function runDueMonitoringChecks() {
  const due = await prisma.monitoringRecord.findMany({
    where: {
      status: 'ACTIVE',
      OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: new Date() } }],
    },
    select: { segmentId: true },
    orderBy: { segment: { departureTime: 'asc' } },
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

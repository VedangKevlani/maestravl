// One trip-wide activity feed, shared by the trip page's "Trip Updates" tab
// (app/(app)/trips/[id]/page.tsx) and the per-segment updates modal
// (GET /api/trips/[id]/activities). They used to be built separately: the
// tab only listed disruptions plus one summary line per run, all filed
// under the segment that was originally disrupted — so a downstream
// segment Maestravl was actively contacting (the connecting flight, the
// hotel) showed "No monitoring events or agent actions yet" when filtered.
// Every entry here is attributed to the segment it actually concerns.
//
// Three real sources, nothing paraphrased beyond a status label:
// - Disruption rows (a detected or reported delay/cancellation)
// - AgentAction rows (each step the recovery agent took) — attributed to the
//   run's disrupted segment when the action itself has no segmentId (e.g.
//   NOTIFY_PASSENGER), so it still lands somewhere sensible
// - NotificationLog rows (each status-change email/text to a passenger)
import { prisma } from '@/lib/db'
import { displaySegmentLabel } from '@/lib/segmentLabel'
import { formatMonitoringStatus } from '@/lib/monitoring/format'
import { formatDuration } from '@/lib/dateFormat'

export type TripActivityType = 'DISRUPTION' | 'AGENT_UPDATE' | 'NOTIFICATION'

export interface TripActivityEntry {
  id: string
  segmentId: string
  segmentLabel: string
  createdAt: Date
  type: TripActivityType
  message: string
}

const PER_SOURCE_LIMIT = 200
const CHANNEL_LABEL: Record<string, string> = { EMAIL: 'an email', SMS: 'a text', WHATSAPP: 'a WhatsApp message' }

/** Kept as an alias — the implementation is pure and lives in lib/segmentLabel.ts so client components can use it. */
export const activitySegmentLabel = displaySegmentLabel

/** Newest first. Caller must already have checked the trip belongs to the requesting user. */
export async function loadTripActivity(tripId: string): Promise<TripActivityEntry[]> {
  const [segments, disruptions, actions, notifications] = await Promise.all([
    prisma.segment.findMany({
      where: { tripId },
      select: { id: true, identifier: true, provider: true, departureLocationCode: true, arrivalLocationCode: true, transportType: true, departureLocation: true },
    }),
    prisma.disruption.findMany({
      where: { tripId },
      orderBy: { detectedAt: 'desc' },
      take: PER_SOURCE_LIMIT,
      select: { id: true, segmentId: true, newStatus: true, delayMinutes: true, detectedAt: true },
    }),
    prisma.agentAction.findMany({
      where: { agentRun: { tripId } },
      orderBy: { createdAt: 'desc' },
      take: PER_SOURCE_LIMIT,
      select: {
        id: true,
        segmentId: true,
        description: true,
        createdAt: true,
        agentRun: { select: { disruption: { select: { segmentId: true } } } },
      },
    }),
    prisma.notificationLog.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      take: PER_SOURCE_LIMIT,
      select: { id: true, segmentId: true, newStatus: true, channel: true, recipientName: true, recipientEmail: true, recipientPhone: true, success: true, createdAt: true },
    }),
  ])

  const labelById = new Map(segments.map((s) => [s.id, activitySegmentLabel(s)]))
  const labelFor = (segmentId: string) => labelById.get(segmentId) ?? 'A removed segment'

  const entries: TripActivityEntry[] = [
    ...disruptions.map((d) => ({
      id: `disruption-${d.id}`,
      segmentId: d.segmentId,
      segmentLabel: labelFor(d.segmentId),
      createdAt: d.detectedAt,
      type: 'DISRUPTION' as const,
      message:
        d.newStatus === 'DELAYED' && d.delayMinutes
          ? `Delay detected — now running ${formatDuration(d.delayMinutes)} late.`
          : `Status changed to ${formatMonitoringStatus(d.newStatus)}.`,
    })),
    ...actions.map((a) => {
      const segmentId = a.segmentId ?? a.agentRun.disruption.segmentId
      return {
        id: `action-${a.id}`,
        segmentId,
        segmentLabel: labelFor(segmentId),
        createdAt: a.createdAt,
        type: 'AGENT_UPDATE' as const,
        message: a.description,
      }
    }),
    ...notifications.map((n) => {
      const who = n.recipientName || n.recipientEmail || n.recipientPhone || 'a passenger'
      const what = CHANNEL_LABEL[n.channel] ?? 'an update'
      const status = formatMonitoringStatus(n.newStatus)
      const message =
        n.channel === 'NONE'
          ? `Status changed to ${status}, but no passenger has an email or phone on file to notify.`
          : n.success
            ? `Sent ${who} ${what} — status ${status}.`
            : `Couldn't send ${who} ${what} about the ${status} status.`
      return {
        id: `notification-${n.id}`,
        segmentId: n.segmentId,
        segmentLabel: labelFor(n.segmentId),
        createdAt: n.createdAt,
        type: 'NOTIFICATION' as const,
        message,
      }
    }),
  ]

  return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

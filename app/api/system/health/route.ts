import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'

// A standing, evidence-based answer to "does this integration actually
// work," not just "is the env var set." Every previous answer to that
// question was a one-time manual test with no lasting record. This route
// never returns secret values — only booleans, counts, and timestamps —
// and is gated the same as every other authenticated route (there's no
// admin role in this app).
//
// "configured" means the required env var(s) are present. "confirmed"
// means real evidence was found in the database that the integration has
// actually done something at least once — the only honest way to know
// something works in production rather than assuming a key being set is
// enough.
export async function GET() {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error

  const [
    sentCommsCount,
    inboundCommsCount,
    recentMonitoringCheck,
    recentFlightCheck,
    transitCandidates,
    webLookupContactCount,
    sentSmsCount,
    sentWhatsAppCount,
  ] = await Promise.all([
    prisma.communication.count({ where: { direction: 'OUTBOUND', status: { in: ['SENT', 'RESPONDED'] } } }),
    prisma.communication.count({ where: { direction: 'INBOUND' } }),
    prisma.monitoringRecord.findFirst({
      where: { lastCheckedAt: { not: null } },
      orderBy: { lastCheckedAt: 'desc' },
      select: { lastCheckedAt: true },
    }),
    prisma.monitoringRecord.findFirst({
      where: { apiProvider: 'flight-adapter-v1', status: { not: 'NOT_CONFIGURED' }, lastCheckedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      select: { lastCheckedAt: true },
    }),
    // `status: 'ACTIVE'` alone isn't real evidence here — it just means
    // TRANSITLAND_API_KEY is set (see runMonitoringCheck in
    // lib/monitoring/service.ts), the same as a segment that's missing its
    // operator/number and always resolves to an honest `noMatch`. Real
    // confirmation requires actually parsing lastKnownData to check a
    // check genuinely matched an operator+route, not just that the
    // pipeline ran.
    prisma.monitoringRecord.findMany({
      where: { apiProvider: { in: ['train-adapter-v1', 'bus-adapter-v1'] }, trackingKey: { not: null }, lastKnownData: { not: null } },
      orderBy: { lastCheckedAt: 'desc' },
      take: 25,
      select: { lastKnownData: true },
    }),
    prisma.providerContact.count({ where: { source: 'WEB_LOOKUP' } }),
    prisma.notificationLog.count({ where: { channel: 'SMS', success: true } }),
    prisma.notificationLog.count({ where: { channel: 'WHATSAPP', success: true } }),
  ])

  const recentTransitCheck = transitCandidates.some((r) => {
    try {
      const parsed = JSON.parse(r.lastKnownData!) as { noMatch?: boolean; status?: string }
      return !parsed.noMatch && parsed.status !== 'UNKNOWN'
    } catch {
      return false
    }
  })

  const has = (name: string) => Boolean(process.env[name])

  const integrations = [
    {
      id: 'email-outbound',
      label: 'Provider & passenger email (Resend)',
      configured: has('RESEND_API_KEY'),
      confirmed: sentCommsCount > 0,
      evidence: sentCommsCount > 0 ? `${sentCommsCount} sent message${sentCommsCount === 1 ? '' : 's'} on record` : null,
    },
    {
      id: 'email-inbound',
      label: 'Inbound reply detection (Resend webhook)',
      configured: has('RESEND_INBOUND_DOMAIN') && has('RESEND_WEBHOOK_SECRET'),
      confirmed: inboundCommsCount > 0,
      evidence: inboundCommsCount > 0 ? `${inboundCommsCount} inbound repl${inboundCommsCount === 1 ? 'y' : 'ies'} received` : 'No inbound reply has been received yet — this only turns green the first time a real provider replies.',
    },
    {
      id: 'monitoring-cron',
      label: 'Monitoring cron (GitHub Actions, every 30 min)',
      configured: has('CRON_SECRET'),
      confirmed: Boolean(recentMonitoringCheck?.lastCheckedAt),
      evidence: recentMonitoringCheck?.lastCheckedAt ? `Last check ran ${recentMonitoringCheck.lastCheckedAt.toISOString()}` : 'No monitoring check has run yet',
    },
    {
      id: 'flight-monitoring',
      label: 'Flight monitoring (AviationStack / AeroDataBox)',
      configured: has('FLIGHT_MONITORING_API_KEY') || has('AERODATABOX_API_KEY'),
      confirmed: Boolean(recentFlightCheck),
      evidence: recentFlightCheck ? 'A flight segment was checked in the last 24h' : 'No confirmed flight check in the last 24h',
    },
    {
      id: 'train-bus-monitoring',
      label: 'Train / bus monitoring (Transitland)',
      configured: has('TRANSITLAND_API_KEY'),
      confirmed: recentTransitCheck,
      evidence: recentTransitCheck
        ? 'At least one train/bus segment has been successfully matched and checked'
        : 'No train/bus segment has resolved to a real match yet — this requires the segment to have its operator name and train/bus number filled in (Edit), not just this key being set.',
    },
    {
      id: 'car-taxi-monitoring',
      label: 'Rental car / taxi / ferry / cruise monitoring',
      configured: false,
      confirmed: false,
      evidence: 'Not implemented — no free, self-serve status API was found for any of these (car-rental and dispatch APIs are all partner/commercial-agreement-gated). See docs/INTEGRATION.md.',
      notImplemented: true,
    },
    {
      id: 'minimax-search',
      label: 'MiniMax web search (contact discovery fallback)',
      configured: has('MINIMAX_API_KEY'),
      confirmed: webLookupContactCount > 0,
      evidence: webLookupContactCount > 0 ? `${webLookupContactCount} contact${webLookupContactCount === 1 ? '' : 's'} discovered via web search` : null,
    },
    {
      id: 'sms-notifications',
      label: 'Passenger SMS (Twilio)',
      configured: has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN') && has('TWILIO_SMS_FROM'),
      confirmed: sentSmsCount > 0,
      evidence: sentSmsCount > 0 ? `${sentSmsCount} SMS notification${sentSmsCount === 1 ? '' : 's'} sent` : null,
    },
    {
      id: 'whatsapp-notifications',
      label: 'Passenger WhatsApp (Twilio Sandbox)',
      configured: has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN') && has('TWILIO_WHATSAPP_FROM'),
      confirmed: sentWhatsAppCount > 0,
      evidence: sentWhatsAppCount > 0 ? `${sentWhatsAppCount} WhatsApp notification${sentWhatsAppCount === 1 ? '' : 's'} sent` : 'Sandbox recipients must text the join code once before Maestravl can message them — see .env.example',
    },
    {
      id: 'voice-assistant',
      label: 'Voice assistant (Groq)',
      configured: has('GROQ_API_KEY'),
      confirmed: null,
      evidence: 'Read-only — no lasting evidence to check beyond configuration',
    },
    {
      id: 'voice-tts',
      label: 'Voice assistant premium TTS (ElevenLabs)',
      configured: has('ELEVENLABS_API_KEY') && has('ELEVENLABS_VOICE_ID'),
      confirmed: null,
      evidence: 'Optional — falls back to the browser\'s own voice when unset',
    },
  ]

  return NextResponse.json({ integrations })
}

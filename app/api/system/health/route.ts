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
    webLookupContactCount,
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
    prisma.providerContact.count({ where: { source: 'WEB_LOOKUP' } }),
  ])

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
      label: 'Train / bus / ferry / taxi monitoring',
      configured: false,
      confirmed: false,
      evidence: 'Not implemented — these adapters are stubs regardless of env vars. See docs/INTEGRATION.md for why (no generic free API exists per-mode the way AviationStack does for flights).',
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
      id: 'voice-assistant',
      label: 'Voice assistant (Gemini)',
      configured: has('GEMINI_API_KEY'),
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

// SMS + WhatsApp notifications via Twilio's Messages API — a plain fetch
// call, no `twilio` npm dependency, same convention as every other external
// integration in this codebase except @google/genai and Resend/Supabase
// (see lib/voice/tts.ts, lib/agents/minimaxSearch.ts, the monitoring
// adapters). Exists alongside lib/email.ts, not instead of it: a passenger
// who's overwhelmed mid-disruption or has no signal may never see an email
// in time, so every passenger-facing notification site attempts every
// channel it has a usable contact for for, not just the first one that works.
//
// SMS and WhatsApp share Twilio's Messages API and identical message copy —
// the only difference is the `whatsapp:` prefix on From/To — so this file
// has one composer per notification purpose (parameterized by channel)
// rather than duplicating each one twice.
import { formatMonitoringStatus } from './monitoring/format'
import { formatDuration } from './agents/message'

const ACCOUNT_SID_VAR = 'TWILIO_ACCOUNT_SID'
const AUTH_TOKEN_VAR = 'TWILIO_AUTH_TOKEN'
const SMS_FROM_VAR = 'TWILIO_SMS_FROM'
const WHATSAPP_FROM_VAR = 'TWILIO_WHATSAPP_FROM'
const REQUEST_TIMEOUT_MS = 10000

export type TextChannel = 'SMS' | 'WHATSAPP'

export function isSmsConfigured(): boolean {
  return Boolean(process.env[ACCOUNT_SID_VAR] && process.env[AUTH_TOKEN_VAR] && process.env[SMS_FROM_VAR])
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env[ACCOUNT_SID_VAR] && process.env[AUTH_TOKEN_VAR] && process.env[WHATSAPP_FROM_VAR])
}

export function isTextChannelConfigured(channel: TextChannel): boolean {
  return channel === 'SMS' ? isSmsConfigured() : isWhatsAppConfigured()
}

/**
 * Sends one message over Twilio's Messages API. Throws with Twilio's own
 * error message on a non-2xx response (same "never swallow a real failure"
 * convention as sendProviderEmail in lib/email.ts) — the caller is always a
 * best-effort site that catches this and logs it, never lets it break the
 * surrounding flow.
 */
async function sendTwilioMessage(channel: TextChannel, to: string, body: string): Promise<void> {
  const accountSid = process.env[ACCOUNT_SID_VAR]
  const authToken = process.env[AUTH_TOKEN_VAR]
  const from = process.env[channel === 'SMS' ? SMS_FROM_VAR : WHATSAPP_FROM_VAR]
  if (!accountSid || !authToken || !from) {
    throw new Error(`${channel} is not configured — set ${ACCOUNT_SID_VAR}/${AUTH_TOKEN_VAR}/${channel === 'SMS' ? SMS_FROM_VAR : WHATSAPP_FROM_VAR}.`)
  }

  const prefix = channel === 'WHATSAPP' ? 'whatsapp:' : ''
  const params = new URLSearchParams({ From: `${prefix}${from}`, To: `${prefix}${to}`, Body: body })

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null) as { message?: string } | null
    throw new Error(data?.message ?? `Twilio ${channel} send failed with status ${res.status}`)
  }
}

export async function sendStatusChangeText(
  channel: TextChannel,
  to: string,
  opts: { recipientName: string; segmentLabel: string; tripTitle: string; newStatus: string }
): Promise<void> {
  const body = `Maestravl: ${opts.segmentLabel} (${opts.tripTitle}) is now ${formatMonitoringStatus(opts.newStatus)}. We're watching it and will keep you posted.`
  await sendTwilioMessage(channel, to, body)
}

export async function sendDisruptionImpactText(
  channel: TextChannel,
  to: string,
  opts: {
    tripTitle: string
    disruptedSegmentLabel: string
    newStatus: string
    delayMinutes: number | null
    affected: { label: string; contacted: boolean; fallbackContact?: { channel: string; value: string } | null }[]
  }
): Promise<void> {
  const newLabel = formatMonitoringStatus(opts.newStatus)
  const delayPhrase = opts.delayMinutes ? `, about ${formatDuration(opts.delayMinutes)} late` : ''

  const contactedCount = opts.affected.filter((a) => a.contacted).length
  const lines = [`Maestravl: ${opts.disruptedSegmentLabel} (${opts.tripTitle}) is now ${newLabel}${delayPhrase}.`]

  if (opts.affected.length > 0) {
    lines.push(
      contactedCount === opts.affected.length
        ? `We reached out to all ${opts.affected.length} affected reservation${opts.affected.length === 1 ? '' : 's'} and are waiting to hear back.`
        : `${contactedCount}/${opts.affected.length} affected reservations contacted automatically.`
    )
    const manualFallbacks = opts.affected.filter((a) => !a.contacted && a.fallbackContact)
    for (const a of manualFallbacks) {
      lines.push(`${a.label}: couldn't auto-contact — found ${a.fallbackContact!.channel.toLowerCase()} ${a.fallbackContact!.value}, you may want to reach out yourself.`)
    }
  }

  lines.push('Full details in the Maestravl app.')
  await sendTwilioMessage(channel, to, lines.join(' '))
}

export async function sendPassengerAddedText(
  channel: TextChannel,
  to: string,
  opts: { recipientName: string; tripTitle: string }
): Promise<void> {
  const body = `Hi ${opts.recipientName}, Maestravl added you as a passenger on "${opts.tripTitle}". You'll get texted here if anything on this trip changes.`
  await sendTwilioMessage(channel, to, body)
}

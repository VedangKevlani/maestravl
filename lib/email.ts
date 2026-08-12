import { Resend } from 'resend'
import { formatMonitoringStatus } from './monitoring/format'
import { formatDuration, formatTime } from './agents/message'
import { formatFriendlyTime } from './dateFormat'

const resend = new Resend(process.env.RESEND_API_KEY)

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const from = process.env.EMAIL_FROM ?? 'Maestravl <onboarding@resend.dev>'

  const { error } = await resend.emails.send({
    from,
    to,
    subject: 'Reset your Maestravl password',
    html: `
      <p>Someone requested a password reset for this account.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
    `,
  })

  if (error) throw new Error(error.message)
}

export async function sendPassengerAddedEmail(
  to: string,
  opts: {
    recipientName: string
    tripTitle: string
    segments: { label: string; departureTime: Date | null; timezone: string | null }[]
  }
) {
  const from = process.env.EMAIL_FROM ?? 'Maestravl <onboarding@resend.dev>'
  const subject = `You're on ${opts.tripTitle}`

  const itineraryHtml = opts.segments.length
    ? `
      <ul>
        ${opts.segments
          .map((s) => `<li>${s.label}${s.departureTime ? ` — ${formatFriendlyTime(s.departureTime, s.timezone)}` : ''}</li>`)
          .join('')}
      </ul>
    `
    : '<p>No segments have been added to this trip yet — you\'ll see them here once they are.</p>'

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html: `
      <p>Hi ${opts.recipientName},</p>
      <p>You've been added as a passenger on <strong>${opts.tripTitle}</strong>. Here's the current itinerary:</p>
      ${itineraryHtml}
      <p>Maestravl will email you here if anything on this trip changes.</p>
    `,
  })

  if (error) throw new Error(error.message)
  return subject
}

export async function sendStatusChangeEmail(
  to: string,
  opts: { recipientName: string; segmentLabel: string; tripTitle: string; previousStatus: string | null; newStatus: string }
) {
  const from = process.env.EMAIL_FROM ?? 'Maestravl <onboarding@resend.dev>'
  const newLabel = formatMonitoringStatus(opts.newStatus)
  const subject = `${opts.segmentLabel} is now ${newLabel}`

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html: `
      <p>Hi ${opts.recipientName},</p>
      <p><strong>${opts.segmentLabel}</strong> (${opts.tripTitle}) ${opts.previousStatus ? `changed from ${formatMonitoringStatus(opts.previousStatus)} to` : 'is now'} <strong>${newLabel}</strong>.</p>
      <p>Maestravl is watching this for you and will keep you posted on anything else that changes.</p>
    `,
  })

  if (error) throw new Error(error.message)
  return subject
}

/** Sent when a disruption's impact analysis finds other segments on the trip that may be affected — see lib/agents/analyze.ts. Only sent when there's something to report; a disruption with no downstream impact just gets the plain sendStatusChangeEmail above. */
export async function sendDisruptionImpactEmail(
  to: string,
  opts: {
    recipientName: string
    tripTitle: string
    disruptedSegmentLabel: string
    newStatus: string
    delayMinutes: number | null
    /** The disrupted segment's own new departure time, when known — shown alongside the delay duration so the passenger sees an actual time, not just a minute count. */
    newDepartureTime: Date | null
    /** The disrupted segment's own timezone — see lib/agents/message.ts's formatTime for why this must never fall back to the server's incidental local zone. */
    timezone: string | null
    /** `contacted: true` means Maestravl actually sent a request to this provider (see sendProviderEmail) — false means no usable contact was found and the passenger needs to follow up themselves. */
    affected: { label: string; reason: string; contacted: boolean }[]
  }
) {
  const from = process.env.EMAIL_FROM ?? 'Maestravl <onboarding@resend.dev>'
  const newLabel = formatMonitoringStatus(opts.newStatus)
  const contactedCount = opts.affected.filter((a) => a.contacted).length
  const subject = `${opts.tripTitle}: ${opts.affected.length} other reservation${opts.affected.length === 1 ? '' : 's'} may need attention`

  const delayPhrase = opts.delayMinutes
    ? ` — about ${formatDuration(opts.delayMinutes)} late${
        opts.newDepartureTime ? `, now expected around ${formatTime(opts.newDepartureTime, opts.timezone)}` : ''
      }`
    : ''

  const affectedHtml = opts.affected
    .map(
      (a) =>
        `<li><strong>${a.label}</strong> — ${a.reason} ${
          a.contacted
            ? "We've reached out to request a change and are waiting to hear back."
            : "We couldn't find a way to contact them automatically — you may want to confirm directly with them for now."
        }</li>`
    )
    .join('')

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html: `
      <p>Hi ${opts.recipientName},</p>
      <p><strong>${opts.disruptedSegmentLabel}</strong> (${opts.tripTitle}) is now <strong>${newLabel}</strong>${delayPhrase}. Here's what that means for the rest of your trip:</p>
      <ul>${affectedHtml}</ul>
      <p>${
        contactedCount > 0
          ? "We'll let you know as soon as we hear back."
          : "We'll keep watching and let you know if anything changes."
      }</p>
    `,
  })

  if (error) throw new Error(error.message)
  return subject
}

/**
 * Sends an agent-composed message to a provider on the passenger's behalf
 * (see lib/agents/message.ts for the templates and lib/agents/orchestrator.ts
 * for what calls this). Unlike the passenger-facing emails above, the body
 * is free text assembled at request time, so it's HTML-escaped before
 * embedding rather than trusted the way this file's fixed templates are.
 *
 * `replyTo`, when given, is the per-Communication address from
 * lib/inboundReplyAddress.ts — when the provider hits "Reply" in their
 * email client, their message goes there instead of the From address,
 * which is how app/api/webhooks/resend-inbound matches it back to this
 * exact conversation. Omitted when RESEND_INBOUND_DOMAIN isn't configured,
 * so an unconfigured deployment just doesn't advertise an address nothing
 * is listening on.
 */
export async function sendProviderEmail(to: string, subject: string, textBody: string, replyTo?: string) {
  const from = process.env.EMAIL_FROM ?? 'Maestravl <onboarding@resend.dev>'
  const html = `<div style="white-space: pre-wrap; font-family: sans-serif;">${escapeHtml(textBody)}</div>`

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
    text: textBody,
    ...(replyTo ? { replyTo } : {}),
  })
  if (error) throw new Error(error.message)
}

export interface ReceivedEmail {
  id: string
  from: string
  to: string[]
  subject: string
  text: string | null
  html: string | null
}

/**
 * Fetches the full content of an inbound email by id — the
 * `email.received` webhook payload only carries metadata (from/to/subject),
 * not the body, per Resend's docs. Returns null on any failure (missing
 * key, API error, network failure) rather than throwing, since the caller
 * (the inbound webhook handler) always has a safe fallback: log what it
 * has and move on, never fabricate the reply's content.
 */
export async function fetchReceivedEmail(emailId: string): Promise<ReceivedEmail | null> {
  if (!process.env.RESEND_API_KEY) return null

  try {
    const { data } = await resend.emails.receiving.get(emailId)
    if (!data) return null
    return {
      id: data.id,
      from: data.from,
      to: data.to,
      subject: data.subject,
      text: data.text,
      html: data.html,
    }
  } catch {
    return null
  }
}

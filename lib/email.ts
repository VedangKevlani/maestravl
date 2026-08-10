import { Resend } from 'resend'
import { formatMonitoringStatus } from './monitoring/format'

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
    segments: { label: string; departureTime: Date | null }[]
  }
) {
  const from = process.env.EMAIL_FROM ?? 'Maestravl <onboarding@resend.dev>'
  const subject = `You're on ${opts.tripTitle}`

  const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const itineraryHtml = opts.segments.length
    ? `
      <ul>
        ${opts.segments
          .map((s) => `<li>${s.label}${s.departureTime ? ` — ${dateFormatter.format(s.departureTime)}` : ''}</li>`)
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
    /** `contacted: true` means Maestravl actually sent a request to this provider (see sendProviderEmail) — false means no usable contact was found and the passenger needs to follow up themselves. */
    affected: { label: string; reason: string; contacted: boolean }[]
  }
) {
  const from = process.env.EMAIL_FROM ?? 'Maestravl <onboarding@resend.dev>'
  const newLabel = formatMonitoringStatus(opts.newStatus)
  const contactedCount = opts.affected.filter((a) => a.contacted).length
  const subject = `${opts.tripTitle}: ${opts.affected.length} other reservation${opts.affected.length === 1 ? '' : 's'} may need attention`

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
      <p><strong>${opts.disruptedSegmentLabel}</strong> (${opts.tripTitle}) is now <strong>${newLabel}</strong>${
        opts.delayMinutes ? ` (about ${opts.delayMinutes} minutes)` : ''
      }. Here's what that means for the rest of your trip:</p>
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
 */
export async function sendProviderEmail(to: string, subject: string, textBody: string) {
  const from = process.env.EMAIL_FROM ?? 'Maestravl <onboarding@resend.dev>'
  const html = `<div style="white-space: pre-wrap; font-family: sans-serif;">${escapeHtml(textBody)}</div>`

  const { error } = await resend.emails.send({ from, to, subject, html, text: textBody })
  if (error) throw new Error(error.message)
}

import { Resend } from 'resend'
import { formatMonitoringStatus } from './monitoring/format'

const resend = new Resend(process.env.RESEND_API_KEY)

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

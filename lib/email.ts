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

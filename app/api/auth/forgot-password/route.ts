import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'
import { hitRateLimit, clientIp, formatRetryAfter, RESET_REQUESTS_PER_IP, RESET_REQUESTS_PER_EMAIL } from '@/lib/security/rateLimit'

const ForgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
})

const RESET_TOKEN_TTL_MS = 1000 * 60 * 60 // 1 hour

// The reset link's origin comes from configuration, never from request
// headers. It used to be built from x-forwarded-host/host — not exploitable
// on Vercel today (Vercel overwrites x-forwarded-host and only routes hosts
// this project owns), but header-derived reset links are the classic
// "password reset poisoning" bug: anywhere a client-supplied host survives
// (a proxy that forwards it, a self-hosted deploy), an attacker requests a
// reset for a victim and the emailed link points at the attacker's domain,
// leaking the token when clicked. APP_URL pins it; production falls back
// to the real domain, and only local dev uses the request's own origin.
const PRODUCTION_ORIGIN = 'https://maestravl.com'

function getOrigin(req: Request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '')
  if (process.env.NODE_ENV === 'production') return PRODUCTION_ORIGIN
  return new URL(req.url).origin
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null)
  const parsed = ForgotPasswordSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set — cannot send password reset email')
    return NextResponse.json({ error: 'Email delivery is not configured yet' }, { status: 500 })
  }

  const { email } = parsed.data

  const byIp = await hitRateLimit(`reset:ip:${clientIp(req.headers)}`, RESET_REQUESTS_PER_IP)
  if (!byIp.allowed) {
    return NextResponse.json(
      { error: `Too many reset requests from this network. Please try again in ${formatRetryAfter(byIp.retryAfterSeconds)}.` },
      { status: 429, headers: { 'Retry-After': String(byIp.retryAfterSeconds) } }
    )
  }

  // Always return the same generic response whether or not the account
  // exists, so this endpoint can't be used to enumerate registered emails.
  const genericResponse = NextResponse.json({
    message: 'If an account exists for that email, a reset link has been sent.',
  })

  // Per-address cap answers with the same generic response (a distinct
  // error would reveal the address is being targeted/exists) — it just
  // stops sending, so the form can't be used to flood someone's inbox.
  const byEmail = await hitRateLimit(`reset:email:${email}`, RESET_REQUESTS_PER_EMAIL)
  if (!byEmail.allowed) return genericResponse

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return genericResponse

  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS)

  // Invalidate any outstanding reset links before issuing a new one.
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } })

  const resetUrl = `${getOrigin(req)}/reset-password?token=${rawToken}`
  await sendPasswordResetEmail(user.email, resetUrl)

  return genericResponse
}

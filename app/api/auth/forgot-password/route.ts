import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'

const ForgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
})

const RESET_TOKEN_TTL_MS = 1000 * 60 * 60 // 1 hour

function getOrigin(req: Request) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? 'http'
  return `${proto}://${host}`
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

  // Always return the same generic response whether or not the account
  // exists, so this endpoint can't be used to enumerate registered emails.
  const genericResponse = NextResponse.json({
    message: 'If an account exists for that email, a reset link has been sent.',
  })

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

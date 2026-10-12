import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { hitRateLimit, clientIp, formatRetryAfter, SIGNUPS_PER_IP } from '@/lib/security/rateLimit'

const SignupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
})

export async function POST(req: Request) {
  // Counted per IP on every attempt (not just successes) — bounds both mass
  // account creation and using this endpoint's 409 to probe which emails
  // already have accounts.
  const limited = await hitRateLimit(`signup:ip:${clientIp(req.headers)}`, SIGNUPS_PER_IP)
  if (!limited.allowed) {
    return NextResponse.json(
      { error: `Too many sign-up attempts from this network. Please try again in ${formatRetryAfter(limited.retryAfterSeconds)}.` },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
    )
  }

  const json = await req.json().catch(() => null)
  const parsed = SignupSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { name, email, password } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'An account with that email already exists' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { name, email, passwordHash },
    select: { id: true, name: true, email: true },
  })

  return NextResponse.json({ user }, { status: 201 })
}

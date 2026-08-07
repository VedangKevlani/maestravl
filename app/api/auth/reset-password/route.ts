import { NextResponse } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const ResetPasswordSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(8).max(200),
})

export async function POST(req: Request) {
  const json = await req.json().catch(() => null)
  const parsed = ResetPasswordSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { token, password } = parsed.data

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } })

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
  ])

  return NextResponse.json({ message: 'Password updated' })
}

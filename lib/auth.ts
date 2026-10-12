import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import {
  checkRateLimit,
  hitRateLimit,
  clientIp,
  LOGIN_FAILURES_PER_EMAIL,
  LOGIN_FAILURES_PER_IP,
} from '@/lib/security/rateLimit'

/** Surfaces to the login page as `code: 'rate_limited'` (see app/login/page.tsx). */
class LoginRateLimited extends CredentialsSignin {
  code = 'rate_limited'
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  // Self-hosted (not Vercel), so Auth.js needs an explicit opt-in to trust
  // the incoming Host header rather than rejecting all requests as a
  // potential host-header-injection attack.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        const email = typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : ''
        const password = typeof credentials?.password === 'string' ? credentials.password : ''
        if (!email || !password) return null

        // Only failed attempts count (see lib/security/rateLimit.ts), and
        // the check runs before bcrypt so a locked-out guesser can't keep
        // probing. Unknown emails count the same as wrong passwords, so the
        // lockout itself never reveals whether an account exists.
        const emailKey = `login:email:${email}`
        const ipKey = `login:ip:${clientIp(request.headers)}`
        const [byEmail, byIp] = await Promise.all([
          checkRateLimit(emailKey, LOGIN_FAILURES_PER_EMAIL),
          checkRateLimit(ipKey, LOGIN_FAILURES_PER_IP),
        ])
        if (!byEmail.allowed || !byIp.allowed) throw new LoginRateLimited()

        const recordFailure = () =>
          Promise.all([hitRateLimit(emailKey, LOGIN_FAILURES_PER_EMAIL), hitRateLimit(ipKey, LOGIN_FAILURES_PER_IP)])

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user) {
          await recordFailure()
          return null
        }

        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) {
          await recordFailure()
          return null
        }

        return { id: user.id, name: user.name, email: user.email }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.sub = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub
      return session
    },
  },
})

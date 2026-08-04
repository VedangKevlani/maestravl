'use client'
import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import RippleMark from '../components/RippleMark'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (res?.error) {
      setError('Incorrect email or password')
      return
    }
    router.push(params.get('callbackUrl') || '/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-label text-white/50">Email</label>
        <input
          id="email" type="email" required autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="glass-card px-4 py-3 text-editorial text-white bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-label text-white/50">Password</label>
        <input
          id="password" type="password" required autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="glass-card px-4 py-3 text-editorial text-white bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
        />
      </div>
      {error && <p role="alert" className="text-editorial text-red-400" style={{ fontSize: '0.85rem' }}>{error}</p>}
      <button
        type="submit" disabled={loading}
        className="mt-2 px-6 py-3 rounded-full text-editorial font-medium disabled:opacity-50"
        style={{ background: 'var(--warm-white)', color: 'var(--charcoal)' }}
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="text-editorial text-white/40 text-center mt-2" style={{ fontSize: '0.85rem' }}>
        No account? <Link href="/signup" className="text-white/70 underline">Sign up</Link>
      </p>
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-24" style={{ background: 'var(--charcoal)' }}>
      <div className="mb-8 flex flex-col items-center gap-3">
        <RippleMark size={40} rings={false} />
        <h1 className="text-display text-white" style={{ fontSize: '1.8rem' }}>Welcome back</h1>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  )
}

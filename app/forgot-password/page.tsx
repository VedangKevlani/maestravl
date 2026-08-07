'use client'
import { useState } from 'react'
import Link from 'next/link'
import MaestravlMark from '../components/MaestravlMark'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setError(null)

    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Something went wrong')
      setStatus('error')
      return
    }
    setStatus('sent')
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-24" style={{ background: 'var(--charcoal)' }}>
      <div className="mb-8 flex flex-col items-center gap-3">
        <MaestravlMark size={40} />
        <h1 className="text-display text-white" style={{ fontSize: '1.8rem' }}>Reset your password</h1>
      </div>

      {status === 'sent' ? (
        <p className="text-editorial text-white/70 text-center max-w-sm" style={{ fontSize: '0.95rem' }}>
          If an account exists for that email, we&apos;ve sent a link to reset your password. It expires in 1 hour.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="w-full max-w-sm flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-label text-white/50">Email</label>
            <input
              id="email" type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="glass-card px-4 py-3 text-editorial text-white bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
            />
          </div>
          {error && <p role="alert" className="text-editorial text-red-400" style={{ fontSize: '0.85rem' }}>{error}</p>}
          <button
            type="submit" disabled={status === 'loading'}
            className="mt-2 px-6 py-3 rounded-full text-editorial font-medium disabled:opacity-50"
            style={{ background: 'var(--warm-white)', color: 'var(--charcoal)' }}
          >
            {status === 'loading' ? 'Sending…' : 'Send reset link'}
          </button>
          <p className="text-editorial text-white/40 text-center mt-2" style={{ fontSize: '0.85rem' }}>
            <Link href="/login" className="text-white/70 underline">Back to sign in</Link>
          </p>
        </form>
      )}
    </main>
  )
}

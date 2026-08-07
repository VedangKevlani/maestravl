'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import MaestravlMark from '../components/MaestravlMark'

function ResetPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      setError(data.error || 'Something went wrong')
      return
    }
    setDone(true)
    setTimeout(() => router.push('/login'), 2000)
  }

  if (!token) {
    return (
      <p className="text-editorial text-white/70 text-center max-w-sm" style={{ fontSize: '0.95rem' }}>
        This reset link is missing its token. Request a new one from{' '}
        <Link href="/forgot-password" className="text-white/70 underline">forgot password</Link>.
      </p>
    )
  }

  if (done) {
    return (
      <p className="text-editorial text-white/70 text-center max-w-sm" style={{ fontSize: '0.95rem' }}>
        Password updated. Redirecting to sign in…
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-label text-white/50">New password</label>
        <input
          id="password" type="password" required minLength={8} autoComplete="new-password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="glass-card px-4 py-3 text-editorial text-white bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
        />
        <span className="text-label text-white/30" style={{ fontSize: '0.65rem' }}>At least 8 characters</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirmPassword" className="text-label text-white/50">Confirm password</label>
        <input
          id="confirmPassword" type="password" required minLength={8} autoComplete="new-password" value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="glass-card px-4 py-3 text-editorial text-white bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
        />
      </div>
      {error && <p role="alert" className="text-editorial text-red-400" style={{ fontSize: '0.85rem' }}>{error}</p>}
      <button
        type="submit" disabled={loading}
        className="mt-2 px-6 py-3 rounded-full text-editorial font-medium disabled:opacity-50"
        style={{ background: 'var(--warm-white)', color: 'var(--charcoal)' }}
      >
        {loading ? 'Updating…' : 'Update password'}
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-24" style={{ background: 'var(--charcoal)' }}>
      <div className="mb-8 flex flex-col items-center gap-3">
        <MaestravlMark size={40} />
        <h1 className="text-display text-white" style={{ fontSize: '1.8rem' }}>Set a new password</h1>
      </div>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </main>
  )
}

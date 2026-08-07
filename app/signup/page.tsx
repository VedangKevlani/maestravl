'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import MaestravlMark from '../components/MaestravlMark'

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Something went wrong')
      setLoading(false)
      return
    }

    const signInRes = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (signInRes?.error) {
      setError('Account created — please sign in')
      router.push('/login')
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-24" style={{ background: 'var(--charcoal)' }}>
      <div className="mb-8 flex flex-col items-center gap-3">
        <MaestravlMark size={40} />
        <h1 className="text-display text-white" style={{ fontSize: '1.8rem' }}>Create your account</h1>
      </div>
      <form onSubmit={onSubmit} className="w-full max-w-sm flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-label text-white/50">Name</label>
          <input
            id="name" type="text" required autoComplete="name" value={name}
            onChange={(e) => setName(e.target.value)}
            className="glass-card px-4 py-3 text-editorial text-white bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
          />
        </div>
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
            id="password" type="password" required minLength={8} autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="glass-card px-4 py-3 text-editorial text-white bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40"
          />
          <span className="text-label text-white/30" style={{ fontSize: '0.65rem' }}>At least 8 characters</span>
        </div>
        {error && <p role="alert" className="text-editorial text-red-400" style={{ fontSize: '0.85rem' }}>{error}</p>}
        <button
          type="submit" disabled={loading}
          className="mt-2 px-6 py-3 rounded-full text-editorial font-medium disabled:opacity-50"
          style={{ background: 'var(--warm-white)', color: 'var(--charcoal)' }}
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
        <p className="text-editorial text-white/40 text-center mt-2" style={{ fontSize: '0.85rem' }}>
          Already have an account? <Link href="/login" className="text-white/70 underline">Sign in</Link>
        </p>
      </form>
    </main>
  )
}

'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AuthShell from '../components/auth/AuthShell'
import styles from '../styles/auth.module.css'

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
    <AuthShell title="Create your account" subtitle="Track flights, trains and passengers in one place.">
      <form onSubmit={onSubmit} className={styles.form} noValidate>
        <div className={styles.field}>
          <label htmlFor="name" className={styles.fieldLabel}>Name</label>
          <input
            id="name" type="text" required autoComplete="name" placeholder="Lumi Rivera"
            value={name} onChange={(e) => setName(e.target.value)}
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="email" className={styles.fieldLabel}>Email</label>
          <input
            id="email" type="email" required autoComplete="email" placeholder="you@example.com"
            value={email} onChange={(e) => setEmail(e.target.value)}
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="password" className={styles.fieldLabel}>Password</label>
          <input
            id="password" type="password" required minLength={8} autoComplete="new-password" placeholder="••••••••"
            value={password} onChange={(e) => setPassword(e.target.value)}
            className={styles.input}
          />
          <div className={styles.hint}>At least 8 characters</div>
        </div>

        {error && <p role="alert" className={styles.error}>{error}</p>}

        <button type="submit" disabled={loading} className={styles.submit}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className={styles.switch}>Already have an account? <Link href="/login">Sign in</Link></p>
    </AuthShell>
  )
}

'use client'
import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AuthShell from '../components/auth/AuthShell'
import PasswordInput from '../components/auth/PasswordInput'
import styles from '../styles/auth.module.css'

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
    <>
      <form onSubmit={onSubmit} className={styles.form} noValidate>
        <div className={styles.field}>
          <label htmlFor="email" className={styles.fieldLabel}>Email</label>
          <input
            id="email" type="email" required autoComplete="email" placeholder="you@example.com"
            value={email} onChange={(e) => setEmail(e.target.value)}
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label htmlFor="password" className={styles.fieldLabel}>Password</label>
            <Link href="/forgot-password" className={styles.forgotLink}>Forgot password?</Link>
          </div>
          <PasswordInput
            id="password" required autoComplete="current-password" placeholder="••••••••"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p role="alert" className={styles.error}>{error}</p>}

        <button type="submit" disabled={loading} className={styles.submit}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className={styles.switch}>No account? <Link href="/signup">Sign up</Link></p>
    </>
  )
}

export default function LoginPage() {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to keep an eye on your trips.">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  )
}

'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Check } from 'lucide-react'
import AuthShell from '../components/auth/AuthShell'
import PasswordInput from '../components/auth/PasswordInput'
import styles from '../styles/auth.module.css'

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
      <p className={styles.successText}>
        This reset link is missing its token. Request a new one from{' '}
        <Link href="/forgot-password" style={{ color: 'var(--auth-accent)' }}>forgot password</Link>.
      </p>
    )
  }

  if (done) {
    return (
      <div className={styles.success}>
        <div className={styles.successIcon}><Check size={20} strokeWidth={2.5} /></div>
        <p className={styles.successText}>Password updated. Redirecting to sign in…</p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className={styles.form} noValidate>
      <div className={styles.field}>
        <label htmlFor="password" className={styles.fieldLabel}>New password</label>
        <PasswordInput
          id="password" required minLength={8} autoComplete="new-password" placeholder="••••••••"
          value={password} onChange={(e) => setPassword(e.target.value)}
        />
        <div className={styles.hint}>At least 8 characters</div>
      </div>
      <div className={styles.field}>
        <label htmlFor="confirmPassword" className={styles.fieldLabel}>Confirm password</label>
        <PasswordInput
          id="confirmPassword" required minLength={8} autoComplete="new-password" placeholder="••••••••"
          value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>

      {error && <p role="alert" className={styles.error}>{error}</p>}

      <button type="submit" disabled={loading} className={styles.submit}>
        {loading ? 'Updating…' : 'Update password'}
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Set a new password">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  )
}

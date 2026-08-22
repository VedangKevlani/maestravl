'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import AuthShell from '../components/auth/AuthShell'
import styles from '../styles/auth.module.css'

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
    <AuthShell title="Reset your password" subtitle="Enter the email on your account and we'll send a reset link.">
      {status === 'sent' ? (
        <div className={styles.success}>
          <div className={styles.successIcon}><Check size={20} strokeWidth={2.5} /></div>
          <p className={styles.successText}>
            If an account exists for that email, we&apos;ve sent a link to reset your password. It expires in 1 hour.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className={styles.form} noValidate>
          <div className={styles.field}>
            <label htmlFor="email" className={styles.fieldLabel}>Email</label>
            <input
              id="email" type="email" required autoComplete="email" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
            />
          </div>

          {error && <p role="alert" className={styles.error}>{error}</p>}

          <button type="submit" disabled={status === 'loading'} className={styles.submit}>
            {status === 'loading' ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      <p className={styles.back}><Link href="/login">← Back to sign in</Link></p>
    </AuthShell>
  )
}

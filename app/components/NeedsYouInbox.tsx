'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import ContactApprovalCard from './ContactApprovalCard'
import type { NeedsYouItem } from '@/lib/agents/needsYou'
import dash from '../styles/dashboard.module.css'
import styles from '../styles/trip.module.css'

/**
 * Every decision waiting on the passenger, across all trips, answerable
 * right here — the same endpoints (and the same server-side checks) as the
 * boarding pass on the trip page. See lib/agents/needsYou.ts for what
 * qualifies.
 */
export default function NeedsYouInbox({ items }: { items: NeedsYouItem[] }) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby="needs-you-heading" style={{ marginBottom: 28 }}>
      <h2 id="needs-you-heading" className={dash.dashSectionTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={dash.dAlertIcon} aria-hidden="true" />
        Needs you ({items.length})
      </h2>
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <InboxItem key={item.runId} item={item} />
        ))}
      </div>
    </section>
  )
}

function InboxItem({ item }: { item: NeedsYouItem }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function post(path: string, body: unknown, fallback: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/agent-runs/${item.runId}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) setError((await res.json().catch(() => ({}))).error || fallback)
    } catch {
      setError("Couldn't reach Maestravl — check your connection and try again.")
    } finally {
      setBusy(false)
      router.refresh()
    }
  }

  return (
    <article className="glass-card p-5" aria-label={`${item.tripTitle}: ${item.headline}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <p className="text-label text-white/40" style={{ fontSize: '0.65rem' }}>
          {item.tripTitle} · {item.segmentLabel}
        </p>
        <Link href={`/trips/${item.tripId}#seg-${item.segmentId}`} className={styles.linkBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          Open trip <ArrowRight size={11} />
        </Link>
      </div>
      <p className="text-editorial text-white" style={{ fontSize: '0.92rem' }}>{item.headline}</p>
      {item.summary && item.summary !== item.headline && (
        <p className="text-editorial text-white/60 mt-1" style={{ fontSize: '0.8rem' }}>{item.summary}</p>
      )}

      {item.latestReply && item.status !== 'AWAITING_APPROVAL' && (
        <blockquote className="mt-2 pl-3 text-editorial text-white/55" style={{ fontSize: '0.78rem', borderLeft: '2px solid rgba(255,255,255,0.15)' }}>
          {item.latestReply.segmentLabel}&rsquo;s provider: &ldquo;{item.latestReply.snippet}&rdquo;
        </blockquote>
      )}

      {item.approvals.length > 0 && (
        <div className="flex flex-col gap-4 mt-3">
          {item.approvals.map((approval) => (
            <ContactApprovalCard key={approval.communicationId} runId={item.runId} approval={approval} label={approval.segmentLabel} />
          ))}
        </div>
      )}

      {item.status === 'RESCHEDULING' && (
        <div className="mt-3 flex flex-col gap-2">
          {item.reschedules.map((r) => (
            <p key={r.segmentLabel} className="text-editorial text-white/75" style={{ fontSize: '0.8rem' }}>
              Confirming moves <strong>{r.segmentLabel}</strong> to <strong>{r.newTime}</strong>.
            </p>
          ))}
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" disabled={busy} className={styles.manageBtn} onClick={() => post('confirm-reschedule', { accept: true }, "Couldn't save your answer — try again.")}>
              {busy ? 'Working…' : 'Confirm — update itinerary'}
            </button>
            <button type="button" disabled={busy} className={styles.manageBtnSecondary} onClick={() => post('confirm-reschedule', { accept: false }, "Couldn't save your answer — try again.")}>
              Not quite
            </button>
          </div>
        </div>
      )}

      {item.status === 'ACTION_REQUIRED' && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Link href={`/trips/${item.tripId}#seg-${item.segmentId}`} className={styles.manageBtn}>
            Review on the trip
          </Link>
          <button type="button" disabled={busy} className={styles.manageBtnSecondary} onClick={() => post('resolve', {}, "Couldn't save that — try again.")}>
            {busy ? 'Working…' : "It's sorted — mark resolved"}
          </button>
        </div>
      )}

      {error && <p role="alert" className="mt-2" style={{ fontSize: '11px', color: '#e5484d' }}>{error}</p>}
    </article>
  )
}

'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Integration {
  id: string
  label: string
  configured: boolean
  confirmed: boolean | null
  evidence: string | null
  notImplemented?: boolean
}

function StatusPill({ integration }: { integration: Integration }) {
  if (integration.notImplemented) {
    return <span className="text-label px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem' }}>Not implemented</span>
  }
  if (!integration.configured) {
    return <span className="text-label px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem' }}>Not configured</span>
  }
  if (integration.confirmed === true) {
    return <span className="text-label px-2 py-0.5 rounded-full" style={{ background: 'rgba(82,183,136,0.12)', color: '#52b788', fontSize: '0.6rem' }}>Confirmed working</span>
  }
  if (integration.confirmed === false) {
    return <span className="text-label px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,168,83,0.15)', color: '#d4a853', fontSize: '0.6rem' }}>Configured, unconfirmed</span>
  }
  return <span className="text-label px-2 py-0.5 rounded-full" style={{ background: 'rgba(74,160,216,0.12)', color: '#4aa0d8', fontSize: '0.6rem' }}>Configured</span>
}

export default function SystemHealthPage() {
  const [integrations, setIntegrations] = useState<Integration[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/system/health')
      .then((res) => {
        if (!res.ok) throw new Error()
        return res.json()
      })
      .then((data) => setIntegrations(data.integrations))
      .catch(() => setError(true))
  }, [])

  return (
    <div className="max-w-2xl">
      <Link href="/dashboard" className="text-label text-white/40 hover:text-white/80" style={{ fontSize: '0.65rem' }}>
        ← Back
      </Link>
      <h1 className="text-editorial text-white font-medium mt-4 mb-1" style={{ fontSize: '1.4rem' }}>System status</h1>
      <p className="text-editorial text-white/50 mb-8" style={{ fontSize: '0.85rem' }}>
        What&apos;s actually configured and what&apos;s actually been confirmed working — from real evidence in the
        database, not just whether an environment variable happens to be set.
      </p>

      {error && (
        <p className="text-editorial text-white/50" style={{ fontSize: '0.85rem' }}>Couldn&apos;t load system status.</p>
      )}

      {!error && integrations === null && (
        <p className="text-editorial text-white/40" style={{ fontSize: '0.85rem' }}>Loading…</p>
      )}

      {integrations && (
        <div className="flex flex-col divide-y divide-white/8">
          {integrations.map((integration) => (
            <div key={integration.id} className="py-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-editorial text-white" style={{ fontSize: '0.9rem' }}>{integration.label}</span>
                <StatusPill integration={integration} />
              </div>
              {integration.evidence && (
                <p className="text-editorial text-white/40 mt-1.5" style={{ fontSize: '0.75rem' }}>{integration.evidence}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

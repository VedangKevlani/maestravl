'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Mail, MailCheck, Clock, Plane, TrainFront, Car, Search, MessageSquare, Phone, Mic, Volume2, type LucideIcon,
} from 'lucide-react'
import styles from '../../styles/systemStatus.module.css'

interface Integration {
  id: string
  label: string
  configured: boolean
  confirmed: boolean | null
  evidence: string | null
  notImplemented?: boolean
}

// One glyph per integration id — mirrors the static prototype's circular
// icon badge on each sys-row. Falls back to a generic dot if a new
// integration id shows up here before this map is updated.
const INTEGRATION_ICONS: Record<string, LucideIcon> = {
  'email-outbound': Mail,
  'email-inbound': MailCheck,
  'monitoring-cron': Clock,
  'flight-monitoring': Plane,
  'train-bus-monitoring': TrainFront,
  'car-taxi-monitoring': Car,
  'minimax-search': Search,
  'sms-notifications': MessageSquare,
  'whatsapp-notifications': Phone,
  'voice-assistant': Mic,
  'voice-tts': Volume2,
}

// Groups + group order ported from system-status.js's SYSTEM_GROUPS —
// the API returns a flat list (grouping isn't its job), so bucket it
// here the same way the reference's static data was already grouped.
const GROUP_ORDER = ['Notifications', 'Monitoring', 'Assistant'] as const
const GROUP_OF: Record<string, (typeof GROUP_ORDER)[number]> = {
  'email-outbound': 'Notifications',
  'email-inbound': 'Notifications',
  'sms-notifications': 'Notifications',
  'whatsapp-notifications': 'Notifications',
  'monitoring-cron': 'Monitoring',
  'flight-monitoring': 'Monitoring',
  'train-bus-monitoring': 'Monitoring',
  'car-taxi-monitoring': 'Monitoring',
  'minimax-search': 'Assistant',
  'voice-assistant': 'Assistant',
  'voice-tts': 'Assistant',
}

function IntegrationIcon({ id, iconClass }: { id: string; iconClass: string }) {
  const Icon = INTEGRATION_ICONS[id]
  return (
    <div className={`${styles.icon} ${iconClass}`} aria-hidden="true">
      {Icon ? <Icon size={14} strokeWidth={2} /> : <span style={{ fontSize: '0.6rem' }}>•</span>}
    </div>
  )
}

// Pill copy + icon tone + hover tip ported verbatim from system-status.js's
// SYSTEM_PILL map.
function statusMeta(integration: Integration): { pillClass: string; iconClass: string; text: string; tip: string } {
  if (integration.notImplemented) {
    return { pillClass: styles.pillNotImplemented, iconClass: styles.iconMuted, text: 'Not implemented', tip: "This is on the roadmap but hasn't been built yet." }
  }
  if (!integration.configured) {
    return { pillClass: styles.pillNotConfigured, iconClass: styles.iconMuted, text: 'Not configured', tip: "This feature hasn't been set up yet. It won't work until it's configured." }
  }
  if (integration.confirmed === true) {
    return { pillClass: styles.pillConfirmed, iconClass: styles.iconConfirmed, text: 'Confirmed working', tip: 'Verified from real activity — this feature has actually been used and worked.' }
  }
  if (integration.confirmed === false) {
    return { pillClass: styles.pillUnconfirmed, iconClass: styles.iconUnconfirmed, text: 'Configured, unconfirmed', tip: "Set up, but something is blocking confirmation — check the evidence note below for what's needed." }
  }
  return { pillClass: styles.pillConfigured, iconClass: styles.icon, text: 'Configured', tip: "The setting is turned on, but there's no real usage yet to confirm it's working end-to-end." }
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

  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: (integrations ?? []).filter((i) => GROUP_OF[i.id] === group),
  })).filter((g) => g.items.length > 0)

  return (
    <div className={styles.wrap}>
      <Link href="/dashboard" className={styles.backLink}>
        <ArrowLeft size={13} /> Dashboard
      </Link>

      <h1 className={styles.title}>System status</h1>
      <hr className="border-0" style={{ borderTop: '1.5px solid var(--border-soft)', marginTop: '16px' }} />
      <p className={styles.subtitle}>
        What&rsquo;s actually configured and what&rsquo;s actually been confirmed working — from real evidence in the
        database, not just whether an environment variable happens to be set.
      </p>

      {error && <p className={styles.evidence}>Couldn&rsquo;t load system status.</p>}
      {!error && integrations === null && <p className={styles.evidence}>Loading…</p>}

      {integrations &&
        groups.map(({ group, items }) => (
          <div key={group}>
            <div className={styles.groupLabel}>{group}</div>
            {items.map((integration) => {
              const meta = statusMeta(integration)
              return (
                <div key={integration.id} className={styles.row}>
                  <IntegrationIcon id={integration.id} iconClass={meta.iconClass} />
                  <div className={styles.text}>
                    <div className={styles.name}>{integration.label}</div>
                    {integration.evidence && <div className={styles.evidence}>{integration.evidence}</div>}
                  </div>
                  <span className={`${styles.pill} ${meta.pillClass}`} title={meta.tip}>
                    {meta.text}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
    </div>
  )
}

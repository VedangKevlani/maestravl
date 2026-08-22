'use client'
import { useState } from 'react'
import styles from '../styles/dashboard.module.css'
import type { ReactNode } from 'react'

export default function DashboardTabs({
  upcomingPanel,
  pastPanel,
}: {
  upcomingPanel: ReactNode
  pastPanel: ReactNode
}) {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')

  return (
    <>
      <div className={styles.tabs}>
        <button
          type="button"
          data-tip="Trips that haven't started yet"
          className={`${styles.tab} ${tab === 'upcoming' ? styles.tabActive : ''}`}
          onClick={() => setTab('upcoming')}
        >
          Upcoming Trips
        </button>
        <button
          type="button"
          data-tip="Trips whose end date has already passed"
          className={`${styles.tab} ${tab === 'past' ? styles.tabActive : ''}`}
          onClick={() => setTab('past')}
        >
          Past Trips
        </button>
      </div>
      <div className={styles.dashPanel}>{tab === 'upcoming' ? upcomingPanel : pastPanel}</div>
    </>
  )
}

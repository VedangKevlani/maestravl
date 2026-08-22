'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, MoreVertical, HeartPulse, LogOut, MessageCircle } from 'lucide-react'
import styles from '../styles/appShell.module.css'
import RestartTourButton from './onboarding/RestartTourButton'
import { useUnreadNotifications } from './useUnreadNotifications'
import { useChat } from './chat/ChatProvider'

/**
 * Shared app-shell header for every route inside the (app) group.
 * Markup/styling only — ported from new-frontend-src/common.{css,js}'s
 * app-header + header-menu. All auth/session/onboarding logic still lives
 * in app/(app)/layout.tsx and is passed in as props.
 */
export default function AppHeader({
  userEmail,
  signOutAction,
}: {
  userEmail: string
  signOutAction: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { unreadCount, markSeen } = useUnreadNotifications()
  const pathname = usePathname()
  const tripMatch = pathname?.match(/^\/trips\/([^/]+)/)
  const tripId = tripMatch?.[1]
  const { toggle: toggleChat } = useChat()

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [menuOpen])

  const namePart = userEmail ? userEmail.split('@')[0] : 'User'
  const displayName = namePart ? namePart.charAt(0).toUpperCase() + namePart.slice(1) : 'User'

  return (
    <header className={styles.header}>
      <Link href="/dashboard" className={styles.brandWrap}>
        <img src="/maestravl-logo-mark.png" alt="MAESTRAVL logo" className={styles.brandImg} />
        <span className={styles.brand}>MAESTRAVL</span>
      </Link>

      <div className={styles.icons}>
        <RestartTourButton className={styles.tourBtn} />

        <Link href="/dashboard" className={styles.tripsBtn}>
          Your Trips
        </Link>

        {tripId && (
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Chat with Maestro"
            onClick={() => toggleChat(tripId)}
          >
            <MessageCircle size={16} strokeWidth={2} />
          </button>
        )}

        <Link href="/notifications" className={styles.iconBtn} aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'} onClick={markSeen}>
          <Bell size={16} strokeWidth={2} />
          {unreadCount > 0 && <span className={styles.unreadDot} aria-hidden="true" />}
        </Link>

        <span className={styles.greet} title={userEmail}>
          Hi, <span className={styles.greetName}>{displayName}</span>!
        </span>

        <div className={styles.menuWrap} ref={menuRef}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="More options"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((open) => !open)
            }}
          >
            <MoreVertical size={16} strokeWidth={2} />
          </button>
          <div className={`${styles.menu} ${menuOpen ? styles.open : ''}`}>
            <Link href="/system-health" className={styles.menuItem} onClick={() => setMenuOpen(false)}>
              <HeartPulse size={14} />
              System status
            </Link>
            <form action={signOutAction}>
              <button type="submit" className={`${styles.menuItem} ${styles.menuItemDanger}`}>
                <LogOut size={14} />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </header>
  )
}

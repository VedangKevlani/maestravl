'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, HeartPulse, LogOut, MessageCircle, ChevronDown, Compass, Briefcase, Globe2, List } from 'lucide-react'
import styles from '../styles/appShell.module.css'
import { useUnreadNotifications } from './useUnreadNotifications'
import { useChat } from './chat/ChatProvider'
import { tripFromPath } from './tripPath'
import { useOnboarding } from './onboarding/OnboardingProvider'

/** "Ada Lovelace" -> "AL", "ada@x.com" -> "A". */
function initialsOf(name: string, email: string): string {
  const source = name.trim() || email.split('@')[0] || '?'
  const words = source.split(/[\s._-]+/).filter(Boolean)
  const letters = words.length >= 2 ? words[0][0] + words[words.length - 1][0] : source.slice(0, 1)
  return letters.toUpperCase()
}

/**
 * Shared app-shell header for every route inside the (app) group. All
 * auth/session/onboarding logic still lives in app/(app)/layout.tsx and is
 * passed in as props — `isAdmin` included, so the developer-only System
 * status link is decided server-side, never by anything the client sends.
 */
export default function AppHeader({
  userName,
  userEmail,
  isAdmin,
  signOutAction,
}: {
  userName: string
  userEmail: string
  isAdmin: boolean
  signOutAction: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const { unreadCount, markSeen } = useUnreadNotifications()
  const pathname = usePathname()
  const router = useRouter()
  const { tripId, onMap } = tripFromPath(pathname)
  const { toggle: toggleChat, open: chatOpen } = useChat()
  const { restart: restartTour } = useOnboarding()

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('click', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    // Move focus into the menu so keyboard users land on the first item.
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuOpen])

  // Arrow-key navigation between items, as expected of role="menu".
  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const index = items.indexOf(document.activeElement as HTMLElement)
    const next = e.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length
    items[next]?.focus()
  }

  const displayName = userName.trim() || (userEmail ? userEmail.split('@')[0] : 'Traveller')
  const initials = initialsOf(userName, userEmail)

  return (
    <header className={styles.header}>
      <Link href="/dashboard" className={styles.brandWrap}>
        <img src="/maestravl-logo-mark.png" alt="MAESTRAVL logo" className={styles.brandImg} />
        <span className={styles.brand}>MAESTRAVL</span>
      </Link>

      <div className={styles.icons}>
        <Link href="/dashboard" className={styles.tripsBtn}>
          Your Trips
        </Link>

        {tripId && (
          <Link
            href={onMap ? `/trips/${tripId}` : `/trips/${tripId}/map`}
            className={styles.iconBtn}
            aria-label={onMap ? 'Back to timeline view' : 'Open map view'}
            title={onMap ? 'Timeline view' : 'Map view'}
          >
            {onMap ? <List size={16} strokeWidth={2} /> : <Globe2 size={16} strokeWidth={2} />}
          </Link>
        )}

        {/* On every page — the assistant works across all your trips. */}
        <button
          type="button"
          className={styles.iconBtn}
          aria-label="Chat with Maestro"
          aria-expanded={chatOpen}
          onClick={toggleChat}
        >
          <MessageCircle size={16} strokeWidth={2} />
        </button>

        <Link href="/notifications" className={styles.iconBtn} aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'} onClick={markSeen}>
          <Bell size={16} strokeWidth={2} />
          {unreadCount > 0 && <span className={styles.unreadDot} aria-hidden="true" />}
        </Link>

        <div className={styles.menuWrap} ref={menuRef} onKeyDown={onMenuKeyDown}>
          <button
            ref={buttonRef}
            type="button"
            className={styles.avatarBtn}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Account menu for ${displayName}`}
            title={userEmail}
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((open) => !open)
            }}
          >
            <span className={styles.avatar} aria-hidden="true">{initials}</span>
            <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
          </button>
          <div className={`${styles.menu} ${styles.menuProfile} ${menuOpen ? styles.open : ''}`} role="menu" aria-label="Account">
            <div className={styles.menuHeader}>
              <span className={styles.avatar} aria-hidden="true">{initials}</span>
              <div style={{ minWidth: 0 }}>
                <div className={styles.menuName}>{displayName}</div>
                <div className={styles.menuEmail}>{userEmail}</div>
              </div>
            </div>
            <hr className={styles.menuDivider} />
            <Link href="/dashboard" role="menuitem" className={styles.menuItem} onClick={() => setMenuOpen(false)}>
              <Briefcase size={14} />
              Your trips
            </Link>
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => {
                setMenuOpen(false)
                restartTour()
                // The tour's first step lives on /dashboard.
                router.push('/dashboard')
              }}
            >
              <Compass size={14} />
              Take the tour
            </button>
            {isAdmin && (
              <Link href="/system-health" role="menuitem" className={styles.menuItem} onClick={() => setMenuOpen(false)}>
                <HeartPulse size={14} />
                System status
                <span className={styles.menuBadge}>Dev</span>
              </Link>
            )}
            <hr className={styles.menuDivider} />
            <form action={signOutAction}>
              <button type="submit" role="menuitem" className={`${styles.menuItem} ${styles.menuItemDanger}`}>
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

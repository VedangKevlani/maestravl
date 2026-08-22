import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import NotificationsList from '../../components/NotificationsList'
import styles from '../../styles/notifications.module.css'

export default async function NotificationsPage() {
  const session = await auth()
  const userId = session!.user.id

  const logs = await prisma.notificationLog.findMany({
    where: { trip: { userId } },
    orderBy: { createdAt: 'desc' },
    include: { trip: true, segment: true },
    take: 100,
  })

  return (
    <div className={styles.wrap}>
      <div className={styles.titleRow}>
        <p className={styles.eyebrow}>Activity</p>
        <h1 className={styles.title}>Notifications</h1>
        <hr className="border-0" style={{ borderTop: '1.5px solid var(--border-soft)', marginTop: '16px' }} />
        <p className={styles.subtitle}>Every status change Maestravl&rsquo;s monitoring caught, and who was told.</p>
      </div>

      <NotificationsList logs={logs} />
    </div>
  )
}

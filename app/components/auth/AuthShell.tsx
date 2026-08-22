import styles from '../../styles/auth.module.css'
import { bricolage } from '../../styles/authFonts'

export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <main className={styles.shell}>
      <div className={styles.bgWrap}>
        <img src="/auth-bg.png" alt="Travelers" className={styles.bgImg} />
        <div className={styles.bgOverlay} />
      </div>

      <div className={styles.content}>
        <div className={styles.brand}>
          <img src="/maestravl-logo.png" alt="MAESTRAVL logo" className={styles.brandImg} />
          <h1 className={`${styles.title} ${bricolage.className}`}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        <div className={styles.card}>{children}</div>
      </div>
    </main>
  )
}

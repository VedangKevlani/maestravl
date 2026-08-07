import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatMonitoringStatus } from '@/lib/monitoring/format'

function formatDate(d: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d)
}

const STATUS_STYLES: Record<string, { bg: string; fg: string }> = {
  ON_TIME: { bg: 'rgba(82,183,136,0.12)', fg: '#52b788' },
  ARRIVED: { bg: 'rgba(82,183,136,0.12)', fg: '#52b788' },
  BOARDING: { bg: 'rgba(74,160,216,0.12)', fg: '#4aa0d8' },
  DEPARTED: { bg: 'rgba(74,160,216,0.12)', fg: '#4aa0d8' },
  DELAYED: { bg: 'rgba(212,168,83,0.15)', fg: '#d4a853' },
  CANCELLED: { bg: 'rgba(229,72,77,0.12)', fg: '#e5484d' },
  UNKNOWN: { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.5)' },
}

function StatusPill({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.UNKNOWN
  return (
    <span
      className="text-label px-2.5 py-1 rounded-full whitespace-nowrap"
      style={{ background: style.bg, color: style.fg, fontSize: '0.6rem' }}
    >
      {formatMonitoringStatus(status)}
    </span>
  )
}

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
    <div>
      <div className="mb-10">
        <p className="text-label text-white/40 mb-2">activity</p>
        <h1 className="text-display text-white" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)' }}>Notifications</h1>
        <p className="text-editorial text-white/50 mt-2" style={{ fontSize: '0.9rem' }}>
          Every status change Maestravl's monitoring caught, and who was told.
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-editorial text-white/50">
            Nothing here yet. Once a monitored segment's status changes, passengers get notified and it'll show up here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {logs.map((log) => (
            <Link key={log.id} href={`/trips/${log.tripId}`} className="glass-card p-6 block hover:bg-white/[0.06] transition-colors">
              <div className="flex items-start justify-between mb-4 gap-2">
                <h2 className="text-editorial text-white font-semibold min-w-0 truncate" style={{ fontSize: '1rem' }}>
                  {log.segment.identifier || log.segment.provider || log.segment.transportType}
                </h2>
                <span
                  className="text-label px-2.5 py-1 rounded-full whitespace-nowrap shrink-0"
                  style={{
                    background: log.success ? 'rgba(82,183,136,0.12)' : 'rgba(229,72,77,0.12)',
                    color: log.success ? '#52b788' : '#e5484d',
                    fontSize: '0.6rem',
                  }}
                >
                  {log.success ? 'sent' : 'failed'}
                </span>
              </div>

              <div className="flex items-center gap-2 mb-3">
                {log.previousStatus && <StatusPill status={log.previousStatus} />}
                {log.previousStatus && <span className="text-white/30">→</span>}
                <StatusPill status={log.newStatus} />
              </div>

              <p className="text-editorial text-white/50 mb-1 truncate" style={{ fontSize: '0.85rem' }}>{log.trip.title}</p>
              <p className="text-editorial text-white/40" style={{ fontSize: '0.8rem' }}>
                {log.channel === 'NONE'
                  ? 'No passenger email on file'
                  : `${log.recipientName ?? 'Passenger'} · ${log.recipientEmail}`}
              </p>
              {!log.success && log.errorMessage && (
                <p className="text-editorial mt-2" style={{ fontSize: '0.75rem', color: '#e5484d' }}>{log.errorMessage}</p>
              )}
              <p className="text-label text-white/25 mt-3" style={{ fontSize: '0.65rem' }}>{formatDate(log.createdAt)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

import type { MonitoringCheckStatus } from './types'

const STATUS_LABELS: Record<MonitoringCheckStatus, string> = {
  ON_TIME: 'on time',
  DELAYED: 'delayed',
  CANCELLED: 'cancelled',
  BOARDING: 'boarding',
  DEPARTED: 'departed',
  ARRIVED: 'arrived',
  UNKNOWN: 'unknown',
}

export function formatMonitoringStatus(status: string): string {
  return STATUS_LABELS[status as MonitoringCheckStatus] ?? status.toLowerCase()
}

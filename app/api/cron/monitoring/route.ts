import { NextResponse } from 'next/server'
import { runDueMonitoringChecks } from '@/lib/monitoring/service'
import { archiveFinishedTrips } from '@/lib/trips/archive'

// Triggered on a schedule (see vercel.json) to run any monitoring checks
// that are due. Not tied to Vercel specifically — any scheduler that can
// send `Authorization: Bearer $CRON_SECRET` works (see docs/INTEGRATION.md).
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = await runDueMonitoringChecks()
  const failed = results.filter((r) => !r.ok)
  // Runs every tick regardless of whether any monitoring check was due —
  // most segment types (hotel, restaurant, etc.) are never monitored at
  // all, so a trip made up entirely of those would never otherwise get
  // swept for archiving.
  const { archived } = await archiveFinishedTrips()

  return NextResponse.json({ checked: results.length, failed: failed.length, results, archived })
}

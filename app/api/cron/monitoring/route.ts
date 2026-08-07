import { NextResponse } from 'next/server'
import { runDueMonitoringChecks } from '@/lib/monitoring/service'

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

  return NextResponse.json({ checked: results.length, failed: failed.length, results })
}

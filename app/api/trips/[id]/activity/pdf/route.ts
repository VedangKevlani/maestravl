import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'
import { segmentLabel } from '@/lib/segmentLabel'
import { buildActivityReportLines, type ActivityReportData } from '@/lib/agents/activityReport'
import { renderActivityReportPdf } from '@/lib/agents/activityReportPdf'

// A real, downloadable PDF of a trip's *entire* recovery history — every
// disruption/run/action/communication that ever happened, not just the 10
// most recent (unlike app/api/trips/[id]/activity/route.ts, which is
// intentionally capped for the live-polling banner/panel use case). Built
// for handing to a human support agent, so it goes through the same
// plain-language time/duration formatting as every other display surface
// (see lib/agents/activityReport.ts) rather than reintroducing raw minutes
// or a wrong/missing timezone on the one artifact meant to explain what
// happened.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id: tripId } = await params

  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId: auth.userId },
    include: { passengers: true },
  })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const runs = await prisma.agentRun.findMany({
    where: { tripId },
    orderBy: { createdAt: 'asc' },
    include: {
      disruption: { include: { segment: true } },
      actions: { orderBy: { createdAt: 'asc' } },
      communications: { orderBy: { createdAt: 'asc' } },
    },
  })

  const reportData: ActivityReportData = {
    tripTitle: trip.title,
    passengerNames: trip.passengers.map((p) => p.name),
    generatedAt: new Date(),
    runs: runs.map((run) => ({
      segmentLabel: segmentLabel(run.disruption.segment),
      segmentTimezone: run.disruption.segment.timezone,
      status: run.status,
      summary: run.summary,
      createdAt: run.createdAt,
      actions: run.actions.map((a) => ({ description: a.description, createdAt: a.createdAt })),
      communications: run.communications.map((c) => ({
        direction: c.direction as 'OUTBOUND' | 'INBOUND',
        subject: c.subject,
        content: c.content,
        createdAt: c.createdAt,
      })),
    })),
  }

  const lines = buildActivityReportLines(reportData)
  const pdfBytes = await renderActivityReportPdf(lines)

  const filename = `${trip.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'trip'}-activity-log.pdf`

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

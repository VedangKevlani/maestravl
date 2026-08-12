// Pure assembler for the trip activity-log PDF (see
// app/api/trips/[id]/activity/pdf/route.ts, which fetches the real data and
// hands it to buildActivityReportLines, then lib/agents/activityReportPdf.ts
// lays the resulting lines out with pdf-lib). Kept pure/DB-free and
// separate from the PDF-drawing code specifically so the actual content —
// right rows, right order, right human-readable formatting — is
// unit-testable without generating a real PDF binary.
//
// Goes through the same formatFriendlyTime/formatDuration fix as every
// other display surface — this is the one artifact meant to go to a human
// support agent, so it must not show raw minutes or a wrong/missing
// timezone either.
import { formatFriendlyTime } from '@/lib/dateFormat'

export interface ActivityReportAction {
  description: string
  createdAt: Date
}

export interface ActivityReportCommunication {
  direction: 'OUTBOUND' | 'INBOUND'
  subject: string | null
  content: string
  createdAt: Date
}

export interface ActivityReportRun {
  segmentLabel: string
  segmentTimezone: string | null
  status: string
  summary: string | null
  createdAt: Date
  actions: ActivityReportAction[]
  communications: ActivityReportCommunication[]
}

export interface ActivityReportData {
  tripTitle: string
  passengerNames: string[]
  generatedAt: Date
  runs: ActivityReportRun[]
}

export type ActivityReportLineStyle = 'title' | 'heading' | 'subheading' | 'body' | 'meta'

export interface ActivityReportLine {
  text: string
  style: ActivityReportLineStyle
}

/**
 * Chronological (oldest run first — a support conversation reads a history
 * top-to-bottom the same way it happened) plain-text report: trip header,
 * then per run its segment/status/summary, every action in plain language
 * with a real local timestamp, and any provider/passenger communications
 * rendered as inert plain text (never HTML — same rule MessageCard.tsx
 * already follows for untrusted provider-supplied content).
 */
export function buildActivityReportLines(data: ActivityReportData): ActivityReportLine[] {
  const lines: ActivityReportLine[] = []

  lines.push({ text: data.tripTitle, style: 'title' })
  lines.push({
    text: data.passengerNames.length > 0 ? `Passengers: ${data.passengerNames.join(', ')}` : 'No passengers on this trip.',
    style: 'meta',
  })
  lines.push({ text: `Generated ${formatFriendlyTime(data.generatedAt, null)}`, style: 'meta' })

  if (data.runs.length === 0) {
    lines.push({ text: 'No recovery activity has happened on this trip yet.', style: 'body' })
    return lines
  }

  const chronological = [...data.runs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  for (const run of chronological) {
    lines.push({ text: `${run.segmentLabel} — ${run.status}`, style: 'heading' })
    if (run.summary) lines.push({ text: run.summary, style: 'body' })

    for (const action of run.actions) {
      lines.push({ text: `${formatFriendlyTime(action.createdAt, run.segmentTimezone)} — ${action.description}`, style: 'body' })
    }

    for (const comm of run.communications) {
      const direction = comm.direction === 'OUTBOUND' ? 'Sent by Maestravl' : 'Reply received'
      lines.push({ text: `${direction}${comm.subject ? ` — ${comm.subject}` : ''}`, style: 'subheading' })
      lines.push({ text: comm.content, style: 'body' })
    }
  }

  return lines
}

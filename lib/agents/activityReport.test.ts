import { describe, it, expect } from 'vitest'
import { buildActivityReportLines, type ActivityReportData } from './activityReport'

function baseData(overrides: Partial<ActivityReportData> = {}): ActivityReportData {
  return {
    tripTitle: 'Kingston -> New York',
    passengerNames: ['Vedang Kevlani'],
    generatedAt: new Date('2026-08-12T20:00:00Z'),
    runs: [],
    ...overrides,
  }
}

describe('buildActivityReportLines', () => {
  it('starts with the trip title, passenger list, and a generated-at line', () => {
    const lines = buildActivityReportLines(baseData())
    expect(lines[0]).toEqual({ text: 'Kingston -> New York', style: 'title' })
    expect(lines[1].text).toContain('Vedang Kevlani')
    expect(lines[2].text).toContain('Generated')
  })

  it('says so honestly when there is no recovery activity yet, rather than an empty report', () => {
    const lines = buildActivityReportLines(baseData())
    expect(lines.some((l) => l.text.includes('No recovery activity'))).toBe(true)
  })

  it('lists passengers as "No passengers" rather than an empty line when there are none', () => {
    const lines = buildActivityReportLines(baseData({ passengerNames: [] }))
    expect(lines[1].text).toBe('No passengers on this trip.')
  })

  it('orders runs chronologically (oldest first) regardless of input order', () => {
    const lines = buildActivityReportLines(
      baseData({
        runs: [
          { segmentLabel: 'Second', segmentTimezone: null, status: 'CONFIRMED', summary: null, createdAt: new Date('2026-08-12T18:00:00Z'), actions: [], communications: [] },
          { segmentLabel: 'First', segmentTimezone: null, status: 'CONFIRMED', summary: null, createdAt: new Date('2026-08-12T10:00:00Z'), actions: [], communications: [] },
        ],
      })
    )
    const headingTexts = lines.filter((l) => l.style === 'heading').map((l) => l.text)
    expect(headingTexts[0]).toContain('First')
    expect(headingTexts[1]).toContain('Second')
  })

  it('renders each action with a real formatted local time, never a raw minute count', () => {
    const lines = buildActivityReportLines(
      baseData({
        runs: [
          {
            segmentLabel: 'AA1742 (KIN -> MIA)',
            segmentTimezone: 'America/Jamaica',
            status: 'ACTION_REQUIRED',
            summary: 'Superseded by a newer report',
            createdAt: new Date('2026-08-12T17:52:29.000Z'),
            actions: [{ description: 'AA1742 is now delayed (delayed 2 hours 30 minutes).', createdAt: new Date('2026-08-12T17:52:32.000Z') }],
            communications: [],
          },
        ],
      })
    )
    const actionLine = lines.find((l) => l.text.includes('AA1742 is now delayed'))
    expect(actionLine).toBeDefined()
    expect(actionLine!.text).toMatch(/Jamaica time/)
    expect(actionLine!.text).not.toMatch(/\bEDT\b|\bEST\b|\bUTC\b/)
  })

  it('renders communications as plain text, labeled by direction, never as HTML', () => {
    const lines = buildActivityReportLines(
      baseData({
        runs: [
          {
            segmentLabel: 'AA3031 (MIA -> JFK)',
            segmentTimezone: null,
            status: 'CONFIRMED',
            summary: null,
            createdAt: new Date('2026-08-12T18:38:00Z'),
            actions: [],
            communications: [
              { direction: 'OUTBOUND', subject: 'Request to reschedule — AA3031', content: 'Hello, ...', createdAt: new Date('2026-08-12T18:38:55Z') },
              { direction: 'INBOUND', subject: null, content: '<script>alert(1)</script> the time works', createdAt: new Date('2026-08-12T18:41:16Z') },
            ],
          },
        ],
      })
    )
    expect(lines.some((l) => l.text.includes('Sent by Maestravl'))).toBe(true)
    expect(lines.some((l) => l.text.includes('Reply received'))).toBe(true)
    // The inbound content is carried verbatim as inert text, not stripped or
    // executed — this module never interprets it as markup.
    expect(lines.some((l) => l.text.includes('<script>alert(1)</script> the time works'))).toBe(true)
  })
})

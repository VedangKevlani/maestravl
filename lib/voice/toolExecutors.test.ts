import { describe, it, expect } from 'vitest'
import { executeGetItinerary, executeGetSegmentStatus, executeGetRecoveryActivity, proposeReportDelay, proposeCheckLiveStatus, proposeRespondToReschedule } from './toolExecutors'
import { STATUS_COPY, actionLabel } from '@/lib/agents/statusCopy'
import type { VoiceContext, VoiceSegment, VoiceRecoveryRun } from './types'

function makeSegment(overrides: Partial<VoiceSegment>): VoiceSegment {
  return {
    id: 'seg-1',
    order: 0,
    transportType: 'FLIGHT',
    status: 'SCHEDULED',
    provider: 'American Airlines',
    identifier: 'AA123',
    departureLocation: 'Kingston',
    departureLocationCode: 'KIN',
    departureTime: new Date('2026-06-16T14:30:00Z'),
    arrivalLocation: 'Miami',
    arrivalLocationCode: 'MIA',
    arrivalTime: new Date('2026-06-16T17:45:00Z'),
    confirmationNumber: 'XJ7K2P',
    notes: null,
    timezone: 'America/Jamaica',
    monitoringStatus: 'on time',
    monitoringCheckedAt: new Date('2026-06-15T12:00:00Z'),
    ...overrides,
  }
}

const NOW = new Date('2026-06-15T12:00:00Z')

function makeContext(overrides: Partial<VoiceContext> = {}): VoiceContext {
  return {
    now: NOW,
    trip: { id: 'trip-1', title: 'Jamaica trip', status: 'UPCOMING' },
    passengers: [{ name: 'Jane Doe', isPrimary: true }],
    segments: [makeSegment({})],
    recentRuns: [],
    ...overrides,
  }
}

describe('executeGetItinerary', () => {
  it('returns trip, passengers, and segments in order', () => {
    const second = makeSegment({ id: 'seg-2', order: 1, identifier: 'BB456' })
    const first = makeSegment({ id: 'seg-1', order: 0, identifier: 'AA123' })
    const result = executeGetItinerary(makeContext({ segments: [second, first] }))
    expect(result.trip).toEqual({ title: 'Jamaica trip', status: 'UPCOMING' })
    expect(result.passengers).toEqual([{ name: 'Jane Doe', isPrimary: true }])
    expect(result.segments.map((s) => s.label)).toEqual(['AA123 (KIN → MIA)', 'BB456 (KIN → MIA)'])
  })
})

describe('executeGetSegmentStatus', () => {
  it('returns the live monitoring status for a found segment', () => {
    const context = makeContext()
    const result = executeGetSegmentStatus(context, { segment: 'AA123' })
    expect(result.found).toBe(true)
    if (result.found) {
      expect(result.liveStatus).toBe('on time')
      expect(result.segment.label).toBe('AA123 (KIN → MIA)')
    }
  })

  it('returns a not-found payload listing real segment labels when nothing matches', () => {
    const context = makeContext()
    const result = executeGetSegmentStatus(context, { segment: 'submarine' })
    expect(result.found).toBe(false)
    if (!result.found && 'availableSegments' in result) {
      expect(result.availableSegments).toEqual(['AA123 (KIN → MIA)'])
    }
  })

  it('returns an ambiguous payload with real candidates when more than one segment matches', () => {
    const hotelA = makeSegment({ id: 'h1', transportType: 'HOTEL', provider: 'Marriott', identifier: null, departureLocationCode: null, arrivalLocationCode: null })
    const hotelB = makeSegment({ id: 'h2', transportType: 'HOTEL', provider: 'Hilton', identifier: null, departureLocationCode: null, arrivalLocationCode: null })
    const context = makeContext({ segments: [hotelA, hotelB] })
    const result = executeGetSegmentStatus(context, { segment: 'hotel' })
    expect(result.found).toBe(false)
    if (!result.found && 'candidates' in result) {
      expect(result.candidates.sort()).toEqual(['Hilton', 'Marriott'])
    }
  })
})

describe('executeGetRecoveryActivity', () => {
  it('reports no activity when there are no recent runs', () => {
    const result = executeGetRecoveryActivity(makeContext(), {})
    expect(result).toEqual({ found: true, hasActivity: false, message: 'Nothing is currently being handled for this trip.' })
  })

  it('reuses STATUS_COPY and ACTION_TYPE_LABEL wording exactly, not its own phrasing', () => {
    const context = makeContext({
      recentRuns: [
        {
          id: 'run-1',
          status: 'CONTACTING',
          summary: null,
          createdAt: new Date('2026-06-15T11:00:00Z'),
          segmentId: 'seg-1',
          segmentLabel: 'AA123 (KIN → MIA)',
          newStatus: 'DELAYED',
          delayMinutes: 90,
          actions: [
            { type: 'CONTACT_PROVIDER', description: 'Emailed American Airlines about the delay', status: 'EXECUTED', createdAt: new Date('2026-06-15T11:01:00Z') },
          ],
        },
      ],
    })
    const result = executeGetRecoveryActivity(context, {})
    expect(result.found).toBe(true)
    if (result.found && result.hasActivity) {
      expect(result.runs[0].headline).toBe(STATUS_COPY['CONTACTING'].headline)
      expect(result.runs[0].recentActions[0].summary).toBe(actionLabel('CONTACT_PROVIDER', 'fallback'))
      expect(result.runs[0].delayMinutes).toBe(90)
      expect(result.runs[0].isResolved).toBe(false)
    } else {
      throw new Error('expected recovery activity to be found')
    }
  })

  it('filters recovery activity to one segment when asked', () => {
    const other = makeSegment({ id: 'seg-2', identifier: 'BB456', departureLocationCode: 'MIA', arrivalLocationCode: 'JFK' })
    const context = makeContext({
      segments: [makeSegment({}), other],
      recentRuns: [
        { id: 'r1', status: 'COMPLETED', summary: null, createdAt: NOW, segmentId: 'seg-1', segmentLabel: 'AA123 (KIN → MIA)', newStatus: 'ON_TIME', delayMinutes: null, actions: [] },
        { id: 'r2', status: 'CONTACTING', summary: null, createdAt: NOW, segmentId: 'seg-2', segmentLabel: 'BB456 (MIA → JFK)', newStatus: 'DELAYED', delayMinutes: 30, actions: [] },
      ],
    })
    const result = executeGetRecoveryActivity(context, { segment: 'BB456' })
    if (result.found && result.hasActivity) {
      expect(result.runs).toHaveLength(1)
      expect(result.runs[0].segment).toBe('BB456 (MIA → JFK)')
    } else {
      throw new Error('expected recovery activity to be found')
    }
  })

  it('returns not-found when filtering to a segment that does not exist', () => {
    const result = executeGetRecoveryActivity(makeContext(), { segment: 'submarine' })
    expect(result.found).toBe(false)
  })
})

describe('proposeReportDelay', () => {
  it('describes a delay in plain language and freezes the exact segment id + status + new time', () => {
    const context = makeContext()
    const result = proposeReportDelay(context, { segment: 'AA123', status: 'DELAYED', newDepartureTime: '2026-06-16T17:00:00.000Z' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.summary).toContain('AA123')
      expect(result.summary).toMatch(/2 hours 30 minutes/)
      expect(result.summary).not.toMatch(/\d+m\b/) // never a raw minute count
      expect(result.frozenArgs).toEqual({ segmentId: 'seg-1', status: 'DELAYED', newDepartureTime: '2026-06-16T17:00:00.000Z' })
    }
  })

  it('describes a cancellation and freezes just the segment id + status', () => {
    const result = proposeReportDelay(makeContext(), { segment: 'AA123', status: 'CANCELLED' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.summary).toContain('cancelled')
      expect(result.frozenArgs).toEqual({ segmentId: 'seg-1', status: 'CANCELLED' })
    }
  })

  it('returns a real not-found payload when the segment cannot be resolved', () => {
    const result = proposeReportDelay(makeContext(), { segment: 'submarine', status: 'CANCELLED' })
    expect(result.ok).toBe(false)
    if (!result.ok && 'availableSegments' in result) {
      expect(result.availableSegments).toEqual(['AA123 (KIN → MIA)'])
    } else {
      throw new Error('expected a not-found payload')
    }
  })

  it('rejects a delay with no new time given, asking for it rather than guessing', () => {
    const result = proposeReportDelay(makeContext(), { segment: 'AA123', status: 'DELAYED' })
    expect(result.ok).toBe(false)
    if (!result.ok && 'error' in result) {
      expect(result.error.toLowerCase()).toContain('time')
    } else {
      throw new Error('expected an error result')
    }
  })

  it('rejects a new time that is not after the scheduled time, via the shared computeManualDelayMinutes rule', () => {
    const result = proposeReportDelay(makeContext(), { segment: 'AA123', status: 'DELAYED', newDepartureTime: '2026-06-16T10:00:00.000Z' })
    expect(result.ok).toBe(false)
  })
})

describe('proposeCheckLiveStatus', () => {
  it('describes the check in plain language and freezes the segment id', () => {
    const result = proposeCheckLiveStatus(makeContext(), { segment: 'AA123' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.summary).toContain('AA123')
      expect(result.frozenArgs).toEqual({ segmentId: 'seg-1' })
    }
  })

  it('returns a real not-found payload when the segment cannot be resolved', () => {
    const result = proposeCheckLiveStatus(makeContext(), { segment: 'submarine' })
    expect(result.ok).toBe(false)
  })
})

function makeRun(overrides: Partial<VoiceRecoveryRun> = {}): VoiceRecoveryRun {
  return {
    id: 'run-1',
    status: 'RESCHEDULING',
    summary: null,
    createdAt: new Date('2026-06-15T11:00:00Z'),
    segmentId: 'seg-1',
    segmentLabel: 'AA123 (KIN → MIA)',
    newStatus: 'DELAYED',
    delayMinutes: 150,
    actions: [],
    pendingReschedule: [
      { segmentId: 'seg-1', segmentLabel: 'AA123 (KIN → MIA)', requestedTime: new Date('2026-06-16T18:00:00Z'), feeAmount: null, currency: null },
    ],
    ...overrides,
  }
}

describe('proposeRespondToReschedule', () => {
  it('describes the pending offer in plain language and freezes the agent run id', () => {
    const context = makeContext({ recentRuns: [makeRun()] })
    const result = proposeRespondToReschedule(context, {})
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.summary).toContain('AA123')
      expect(result.summary.toLowerCase()).toContain('accept')
      expect(result.frozenArgs).toEqual({ agentRunId: 'run-1' })
    }
  })

  it('mentions a fee when one applies', () => {
    const context = makeContext({
      recentRuns: [makeRun({ pendingReschedule: [{ segmentId: 'seg-1', segmentLabel: 'AA123 (KIN → MIA)', requestedTime: new Date('2026-06-16T18:00:00Z'), feeAmount: 25, currency: 'USD' }] })],
    })
    const result = proposeRespondToReschedule(context, {})
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.summary).toContain('25')
  })

  it('says honestly that nothing is pending when there is no RESCHEDULING run', () => {
    const result = proposeRespondToReschedule(makeContext(), {})
    expect(result.ok).toBe(false)
  })

  it('returns real candidates when more than one reschedule is pending', () => {
    const other = makeSegment({ id: 'seg-2', identifier: 'BB456', departureLocationCode: 'MIA', arrivalLocationCode: 'JFK' })
    const context = makeContext({
      segments: [makeSegment({}), other],
      recentRuns: [
        makeRun(),
        makeRun({ id: 'run-2', segmentId: 'seg-2', pendingReschedule: [{ segmentId: 'seg-2', segmentLabel: 'BB456 (MIA → JFK)', requestedTime: new Date('2026-06-16T20:00:00Z'), feeAmount: null, currency: null }] }),
      ],
    })
    const result = proposeRespondToReschedule(context, {})
    expect(result.ok).toBe(false)
    if (!result.ok && 'candidates' in result) {
      expect(result.candidates?.sort()).toEqual(['AA123 (KIN → MIA)', 'BB456 (MIA → JFK)'])
    } else {
      throw new Error('expected a candidates payload')
    }
  })
})

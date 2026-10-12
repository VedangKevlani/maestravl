import { describe, it, expect } from 'vitest'
import { executeGetItinerary, executeGetSegmentStatus, executeGetRecoveryActivity, executeProposeAction, executeListTrips, executeGetNeedsYou, executeCheckItinerary, executeLocalTime } from './toolExecutors'
import { STATUS_COPY, actionLabel } from '@/lib/agents/statusCopy'
import type { VoiceContext, VoiceSegment } from './types'
import { ProposeActionArgsSchema } from './tools'

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
    monitoringActive: true,
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
    pendingApprovals: [],
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
            { segmentId: 'seg-1', type: 'CONTACT_PROVIDER', description: 'Emailed American Airlines about the delay', status: 'EXECUTED', createdAt: new Date('2026-06-15T11:01:00Z') },
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

describe('executeProposeAction', () => {
  // AA123 departs KIN 14:30Z = 9:30 AM Jamaica time on Jun 16.
  it('prepares a delay report in the segment\'s own zone, without doing anything', () => {
    const { result, proposal } = executeProposeAction(makeContext(), { action: 'report_delay', segment: 'AA123', newTime: '13:00' })
    expect(result.proposed).toBe(true)
    expect(proposal?.kind).toBe('report_delay')
    expect(proposal?.newDepartureTime).toBe('2026-06-16T18:00:00.000Z') // 1:00 PM Jamaica (UTC-5)
    expect(proposal?.title).toContain('1:00 PM, Jamaica time')
    expect(String(result.instruction)).toMatch(/NOT happened/)
  })

  it('refuses a "delay" that is not later than the scheduled time', () => {
    const { result, proposal } = executeProposeAction(makeContext(), { action: 'report_delay', segment: 'AA123', newTime: '08:00' })
    expect(proposal).toBeNull()
    expect(result.proposed).toBe(false)
  })

  it('asks for the new time before proposing a delay', () => {
    expect(executeProposeAction(makeContext(), { action: 'report_delay', segment: 'AA123' }).proposal).toBeNull()
  })

  it('refuses to confirm a reschedule when no provider reply is waiting', () => {
    expect(executeProposeAction(makeContext(), { action: 'confirm_reschedule', segment: 'AA123' }).proposal).toBeNull()
  })

  it('prepares an approval only for a contact Maestravl is actually waiting on, with its real ids', () => {
    const context = makeContext({
      pendingApprovals: [
        { runId: 'run-9', segmentId: 'seg-1', segmentLabel: 'AA123 (KIN → MIA)', communicationId: 'comm-9', contactValue: 'help@aa.com', subject: 'Request to reschedule', isFollowUp: false },
      ],
    })
    const { proposal } = executeProposeAction(context, { action: 'approve_contact', segment: 'AA123' })
    expect(proposal).toMatchObject({ kind: 'approve_contact', runId: 'run-9', communicationId: 'comm-9' })
    expect(proposal?.title).toContain('help@aa.com')
    expect(executeProposeAction(makeContext(), { action: 'approve_contact', segment: 'AA123' }).proposal).toBeNull()
  })

  it('does not guess between segments', () => {
    const context = makeContext({ segments: [makeSegment({}), makeSegment({ id: 'seg-2', identifier: 'AA123', departureLocationCode: 'MIA', arrivalLocationCode: 'JFK' })] })
    expect(executeProposeAction(context, { action: 'report_cancellation', segment: 'AA123' }).proposal).toBeNull()
  })
})

// The schema is what the model's raw arguments actually pass through
// (lib/voice/agent.ts parses them before the executor ever runs) — tested
// directly because a broken pattern here silently rejects every real call.
describe('ProposeActionArgsSchema', () => {
  it('accepts the time and date formats the tool description asks for', () => {
    expect(ProposeActionArgsSchema.safeParse({ action: 'report_delay', segment: 'AA123', newTime: '18:30', newDate: '2026-12-01' }).success).toBe(true)
    expect(ProposeActionArgsSchema.safeParse({ action: 'report_delay', segment: 'AA123', newTime: '6:30' }).success).toBe(true)
  })

  it('rejects malformed times and unknown actions', () => {
    expect(ProposeActionArgsSchema.safeParse({ action: 'report_delay', segment: 'AA123', newTime: '6.30pm' }).success).toBe(false)
    expect(ProposeActionArgsSchema.safeParse({ action: 'delete_trip', segment: 'AA123' }).success).toBe(false)
  })
})

describe('executeProposeAction — expanded actions', () => {
  it('adds a passenger to the trip, and says who will be messaged', () => {
    const { proposal } = executeProposeAction(makeContext(), { action: 'add_passenger', passengerName: 'Ada Lovelace', passengerEmail: 'ada@example.com' })
    expect(proposal).toMatchObject({ kind: 'add_passenger', tripId: 'trip-1', passenger: { name: 'Ada Lovelace', email: 'ada@example.com', phone: null } })
    expect(proposal?.detail).toMatch(/an email/)
  })

  it('needs a name before adding a passenger', () => {
    expect(executeProposeAction(makeContext(), { action: 'add_passenger' }).proposal).toBeNull()
  })

  it('updates only a whitelisted detail, mapped to the API field', () => {
    const { proposal } = executeProposeAction(makeContext(), { action: 'update_segment', segment: 'AA123', field: 'gate', value: 'B22' })
    expect(proposal).toMatchObject({ kind: 'update_segment', segmentId: 'seg-1', segmentUpdate: { departureGate: 'B22' } })
    expect(proposal?.title).toBe('Set AA123 (KIN → MIA)\'s gate to "B22"')
  })

  it('refuses an over-long value', () => {
    expect(executeProposeAction(makeContext(), { action: 'update_segment', segment: 'AA123', field: 'seat', value: 'x'.repeat(30) }).proposal).toBeNull()
  })

  it('only offers a live re-check for actively monitored segments', () => {
    expect(executeProposeAction(makeContext(), { action: 'check_status_now', segment: 'AA123' }).proposal?.kind).toBe('check_status_now')
    const paused = makeContext({ segments: [makeSegment({ monitoringActive: false })] })
    expect(executeProposeAction(paused, { action: 'check_status_now', segment: 'AA123' }).proposal).toBeNull()
  })

  it('marks resolved only a run that is actually waiting', () => {
    const run = { id: 'run-1', status: 'WAITING_FOR_RESPONSE', summary: null, createdAt: NOW, segmentId: 'seg-1', segmentLabel: 'AA123 (KIN → MIA)', newStatus: 'DELAYED', delayMinutes: 60, actions: [] }
    expect(executeProposeAction(makeContext({ recentRuns: [run] }), { action: 'mark_resolved', segment: 'AA123' }).proposal).toMatchObject({ kind: 'mark_resolved', runId: 'run-1' })
    expect(executeProposeAction(makeContext({ recentRuns: [{ ...run, status: 'CONFIRMED' }] }), { action: 'mark_resolved', segment: 'AA123' }).proposal).toBeNull()
  })
})

describe('account-wide read tools', () => {
  const account = {
    now: NOW,
    userName: 'Jane',
    homeTimezone: 'America/New_York',
    pageTripId: null,
    trips: [{ id: 'trip-1', title: 'Jamaica trip', status: 'UPCOMING', startsAt: new Date('2026-06-16T14:30:00Z'), endsAt: null, segmentCount: 1, nextSegmentLabel: 'AA123 (KIN → MIA)', nextSegmentStartsAt: new Date('2026-06-16T14:30:00Z') }],
    needsYou: [{ tripId: 'trip-1', tripTitle: 'Jamaica trip', segmentLabel: 'AA123', headline: 'Waiting for your OK', summary: null }],
  }

  it('lists trips in the user\'s home time', () => {
    const r = executeListTrips(account)
    expect(r.trips[0]).toMatchObject({ title: 'Jamaica trip', next: 'AA123 (KIN → MIA) at Jun 16, 10:30 AM, New York time' })
  })

  it('summarises decisions waiting on the user', () => {
    expect(executeGetNeedsYou(account)).toMatchObject({ count: 1 })
    expect(executeGetNeedsYou({ ...account, needsYou: [] })).toMatchObject({ count: 0 })
  })

  it('reports itinerary problems in plain words', () => {
    const tight = makeSegment({ id: 'seg-2', order: 1, identifier: 'BB456', departureLocationCode: 'MIA', arrivalLocationCode: 'JFK', departureTime: new Date('2026-06-16T18:00:00Z'), arrivalTime: new Date('2026-06-16T21:00:00Z') })
    const r = executeCheckItinerary(makeContext({ segments: [makeSegment({}), tight] }))
    expect(r.problemsFound).toBe(1)
  })

  it('gives local time for an airport code with the difference from home', () => {
    const r = executeLocalTime(account, null, { place: 'LHR' })
    expect(r).toMatchObject({ found: true, zone: 'Europe/London', hoursAheadOfHome: 5 })
  })

  it('says so rather than guessing an unknown zone', () => {
    expect(executeLocalTime(account, null, { place: 'Rose Hall' })).toMatchObject({ found: false })
  })
})

describe('tool arguments sent as null', () => {
  it('treats null optional arguments as not given (gpt-oss sends "trip": null)', () => {
    const parsed = ProposeActionArgsSchema.safeParse({ action: 'report_cancellation', segment: 'AA123', trip: null, newTime: null })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.trip).toBeUndefined()
  })
})

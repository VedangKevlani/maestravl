import { describe, it, expect } from 'vitest'
import { friendlyZoneLabel, formatFriendlyTime, formatDuration, resolveSegmentZones, classifyArrivalHour, zonedDateTimeToUtc, utcToZonedDateTimeParts, segmentEntryZones } from './dateFormat'

describe('friendlyZoneLabel', () => {
  it('derives a plain-language label from the IANA zone name', () => {
    expect(friendlyZoneLabel('America/New_York')).toBe('New York time')
    expect(friendlyZoneLabel('America/Jamaica')).toBe('Jamaica time')
  })

  it('falls back to "local time", never "UTC", when the zone is unknown', () => {
    expect(friendlyZoneLabel(null)).toBe('local time')
  })
})

describe('formatFriendlyTime', () => {
  it('renders a plain-language zone name instead of a technical abbreviation', () => {
    const rendered = formatFriendlyTime(new Date('2026-08-13T03:55:00.000Z'), 'America/New_York')
    expect(rendered).toContain('11:55 PM')
    expect(rendered).toContain('New York time')
    expect(rendered).not.toMatch(/\bEDT\b|\bEST\b|\bGMT\b|\bUTC\b/)
  })

  it('falls back to "local time" rather than a bare UTC label when no zone is known', () => {
    const rendered = formatFriendlyTime(new Date('2026-08-13T03:55:00.000Z'), null)
    expect(rendered).toContain('local time')
  })
})

describe('formatDuration', () => {
  it('never emits a raw minute count on its own', () => {
    expect(formatDuration(150)).toBe('2 hours 30 minutes')
    expect(formatDuration(30)).toBe('30 minutes')
    expect(formatDuration(60)).toBe('1 hour')
    expect(formatDuration(90)).toBe('1 hour 30 minutes')
  })
})

describe('resolveSegmentZones', () => {
  it('prefers each end\'s own airport code lookup over the segment\'s single manual timezone field', () => {
    const zones = resolveSegmentZones({ departureLocationCode: 'KIN', arrivalLocationCode: 'MIA', timezone: null })
    expect(zones.departure).toBe('America/Jamaica')
    expect(zones.arrival).toBe('America/New_York')
  })

  it('falls back to the manual timezone field for departure when the code is unresolvable', () => {
    const zones = resolveSegmentZones({ departureLocationCode: 'ZZZ', arrivalLocationCode: null, timezone: 'America/Denver' })
    expect(zones.departure).toBe('America/Denver')
  })

  it('never silently reuses the departure zone for an unresolvable arrival — returns null instead', () => {
    const zones = resolveSegmentZones({ departureLocationCode: 'KIN', arrivalLocationCode: 'ZZZ', timezone: null })
    expect(zones.departure).toBe('America/Jamaica')
    expect(zones.arrival).toBeNull()
  })

  it('returns nulls for a segment with no resolvable location at all', () => {
    const zones = resolveSegmentZones({ departureLocationCode: null, arrivalLocationCode: null, timezone: null })
    expect(zones).toEqual({ departure: null, arrival: null })
  })
})

describe('zonedDateTimeToUtc', () => {
  it('parses wall-clock time as being in the given zone, not the runtime\'s own zone', () => {
    // 9:00 AM in Kingston (America/Jamaica, fixed UTC-5, no DST) is 14:00 UTC.
    const d = zonedDateTimeToUtc('2026-08-13', '09:00', 'America/Jamaica')
    expect(d.toISOString()).toBe('2026-08-13T14:00:00.000Z')
  })

  it('produces different instants for the same wall-clock time in different zones', () => {
    const kingston = zonedDateTimeToUtc('2026-08-13', '09:00', 'America/Jamaica')
    const newYork = zonedDateTimeToUtc('2026-08-13', '09:00', 'America/New_York')
    expect(kingston.getTime()).not.toBe(newYork.getTime())
  })

  it('handles a zone observing daylight saving correctly', () => {
    // 9:00 AM EDT (America/New_York, UTC-4 in August) is 13:00 UTC.
    const d = zonedDateTimeToUtc('2026-08-13', '09:00', 'America/New_York')
    expect(d.toISOString()).toBe('2026-08-13T13:00:00.000Z')
  })

  it('falls back to parsing as UTC when no zone is known', () => {
    const d = zonedDateTimeToUtc('2026-08-13', '09:00', null)
    expect(d.toISOString()).toBe('2026-08-13T09:00:00.000Z')
  })
})

describe('classifyArrivalHour', () => {
  it('classifies the small hours (midnight-5:59am) as LATE_NIGHT', () => {
    // 03:55 UTC on 2026-08-13 is 11:55 PM EDT on 2026-08-12 in New York —
    // shift further to land inside midnight-6am New York time.
    expect(classifyArrivalHour(new Date('2026-08-13T07:00:00.000Z'), 'America/New_York')).toBe('LATE_NIGHT') // 3am NY
  })

  it('classifies early morning / late evening as a softer EARLY_MORNING band', () => {
    expect(classifyArrivalHour(new Date('2026-08-13T03:55:00.000Z'), 'America/New_York')).toBe('EARLY_MORNING') // 11:55pm NY
    expect(classifyArrivalHour(new Date('2026-08-13T10:30:00.000Z'), 'America/New_York')).toBe('EARLY_MORNING') // 6:30am NY
  })

  it('classifies daytime hours as NORMAL', () => {
    expect(classifyArrivalHour(new Date('2026-08-13T18:00:00.000Z'), 'America/New_York')).toBe('NORMAL') // 2pm NY
  })
})

describe('utcToZonedDateTimeParts', () => {
  it('splits an instant into date/time input values in the given zone', () => {
    // 09:55 UTC in mid-August is 05:55 EDT
    expect(utcToZonedDateTimeParts('2026-08-14T09:55:00.000Z', 'America/New_York')).toEqual({ date: '2026-08-14', time: '05:55' })
  })

  it('crosses the calendar date when the zone does', () => {
    expect(utcToZonedDateTimeParts('2026-08-14T02:30:00.000Z', 'America/Jamaica')).toEqual({ date: '2026-08-13', time: '21:30' })
  })

  it('renders midnight as 00, not 24', () => {
    expect(utcToZonedDateTimeParts('2026-08-14T04:00:00.000Z', 'America/New_York')).toEqual({ date: '2026-08-14', time: '00:00' })
  })

  it('returns empty values for a missing or invalid instant', () => {
    expect(utcToZonedDateTimeParts(null, 'America/New_York')).toEqual({ date: '', time: '' })
    expect(utcToZonedDateTimeParts('not a date', 'America/New_York')).toEqual({ date: '', time: '' })
  })

  // The regression this exists for: an edit form that prefills in one zone
  // and parses in another silently moves a segment every time it's saved.
  it('round-trips exactly through zonedDateTimeToUtc in every zone, including across DST', () => {
    const instants = ['2026-03-08T07:30:00.000Z', '2026-08-14T09:55:00.000Z', '2026-11-01T05:30:00.000Z', '2026-12-31T23:59:00.000Z']
    for (const zone of ['America/New_York', 'America/Jamaica', 'Europe/London', 'Asia/Kolkata', null]) {
      for (const iso of instants) {
        const { date, time } = utcToZonedDateTimeParts(iso, zone)
        expect(zonedDateTimeToUtc(date, time, zone).toISOString()).toBe(iso)
      }
    }
  })
})

describe('segmentEntryZones', () => {
  it('uses each endpoint\'s airport zone, matching how the boarding pass displays it', () => {
    const zones = segmentEntryZones({ departureLocationCode: 'JFK', arrivalLocationCode: 'MBJ', timezone: 'America/Chicago' })
    expect(zones).toEqual({ departure: 'America/New_York', arrival: 'America/Jamaica' })
  })

  it('falls back to the timezone field for both ends when there are no airport codes (hotel, train)', () => {
    const zones = segmentEntryZones({ departureLocationCode: null, arrivalLocationCode: null, timezone: 'Europe/Paris' })
    expect(zones).toEqual({ departure: 'Europe/Paris', arrival: 'Europe/Paris' })
  })

  it('uses the departure zone for an arrival with no resolvable airport', () => {
    const zones = segmentEntryZones({ departureLocationCode: 'KIN', arrivalLocationCode: 'ZZZ', timezone: null })
    expect(zones).toEqual({ departure: 'America/Jamaica', arrival: 'America/Jamaica' })
  })
})

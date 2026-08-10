import { describe, it, expect } from 'vitest'
import { calculateImpact, calculateCancellationImpact, type DependencySegment } from './graph'

const HOUR = 60 * 60 * 1000
const base = new Date('2026-12-15T12:00:00Z')

function seg(
  id: string,
  order: number,
  departureTime: Date | null,
  arrivalTime: Date | null,
  transportType: DependencySegment['transportType'] = 'FLIGHT'
): DependencySegment {
  return { id, order, transportType, departureTime, arrivalTime }
}

describe('calculateImpact', () => {
  it('returns nothing for a non-positive delay', () => {
    const segments = [seg('flight', 0, base, new Date(base.getTime() + HOUR))]
    expect(calculateImpact(segments, 'flight', 0)).toEqual([])
    expect(calculateImpact(segments, 'flight', -30)).toEqual([])
  })

  it('returns nothing when the disrupted segment id is not found', () => {
    const segments = [seg('flight', 0, base, new Date(base.getTime() + HOUR))]
    expect(calculateImpact(segments, 'missing', 240)).toEqual([])
  })

  it('marks a downstream segment DIRECT when the delay overruns its buffer, and proposes the shifted start', () => {
    // Flight arrives 12:00, transfer was scheduled for 12:30 (30m buffer) —
    // a 4h delay obliterates it. The flight's actual arrival (base+4h) is
    // what should get proposed as the transfer's new start.
    const flight = seg('flight', 0, base, new Date(base.getTime() + 0))
    const transfer = seg('transfer', 1, new Date(base.getTime() + 30 * 60 * 1000), null, 'TAXI')
    const [impact] = calculateImpact([flight, transfer], 'flight', 240)
    expect(impact.segmentId).toBe('transfer')
    expect(impact.level).toBe('DIRECT')
    expect(impact.shiftedStart).toEqual(new Date(base.getTime() + 4 * HOUR))
  })

  it('marks a downstream segment POTENTIAL when the buffer shrinks but does not break, with no proposed time', () => {
    // 3h original buffer, 2h delay leaves 1h — inside the 2h warning band.
    const flight = seg('flight', 0, base, base)
    const hotel = seg('hotel', 1, new Date(base.getTime() + 3 * HOUR), null, 'HOTEL')
    const [impact] = calculateImpact([flight, hotel], 'flight', 120)
    expect(impact.level).toBe('POTENTIAL')
    expect(impact.bufferMinutes).toBe(60)
    expect(impact.shiftedStart).toBeNull()
  })

  it('marks a downstream segment UNAFFECTED when the buffer comfortably absorbs the delay', () => {
    // 6h original buffer, 1h delay leaves 5h — well past the 2h warning band.
    const flight = seg('flight', 0, base, base)
    const dinner = seg('dinner', 1, new Date(base.getTime() + 6 * HOUR), null, 'RESTAURANT')
    const [impact] = calculateImpact([flight, dinner], 'flight', 60)
    expect(impact.level).toBe('UNAFFECTED')
    expect(impact.shiftedStart).toBeNull()
  })

  it('cascades the shift through a tight segment and lets a later, larger buffer absorb it', () => {
    // Flight delayed 4h: original end `base`, actual end `base+4h`.
    // Transfer was scheduled just 30m after the original flight arrival —
    // DIRECT, since the plane doesn't even land until 3h30m after that.
    // Transfer has 0 duration, so its own actual end becomes `base+4h`
    // (pushed to match the flight's actual arrival, its own scheduled time
    // being moot at that point).
    // Hotel was scheduled 9h after `base` — comfortably later than the
    // transfer's actual (post-cascade) end of `base+4h`, so it's UNAFFECTED.
    // Excursion, scheduled a further 6h after hotel, stays UNAFFECTED too.
    const flight = seg('flight', 0, base, base)
    const transfer = seg('transfer', 1, new Date(base.getTime() + 30 * 60 * 1000), new Date(base.getTime() + 30 * 60 * 1000), 'TAXI')
    const hotel = seg('hotel', 2, new Date(base.getTime() + 9 * HOUR), null, 'HOTEL')
    const excursion = seg('excursion', 3, new Date(base.getTime() + 15 * HOUR), null, 'EXCURSION')

    const impacts = calculateImpact([flight, transfer, hotel, excursion], 'flight', 240)
    const byId = Object.fromEntries(impacts.map((i) => [i.segmentId, i]))

    expect(byId.transfer.level).toBe('DIRECT')
    expect(byId.hotel.level).toBe('UNAFFECTED')
    expect(byId.excursion.level).toBe('UNAFFECTED')
    expect(impacts).toHaveLength(3)
  })

  it('ignores segments scheduled before the disrupted one', () => {
    const hotel = seg('hotel', 0, base, base, 'HOTEL')
    const flight = seg('flight', 1, new Date(base.getTime() + HOUR), null)
    const impacts = calculateImpact([hotel, flight], 'flight', 60)
    expect(impacts.find((i) => i.segmentId === 'hotel')).toBeUndefined()
  })

  it('flags POTENTIAL with a null buffer when schedule data is missing, and keeps propagating the delay', () => {
    const flight = seg('flight', 0, base, base)
    const mystery = seg('mystery', 1, null, null, 'OTHER')
    const dinner = seg('dinner', 2, new Date(base.getTime() + 30 * 60 * 1000), null, 'RESTAURANT')

    const impacts = calculateImpact([flight, mystery, dinner], 'flight', 60)
    expect(impacts[0]).toMatchObject({ segmentId: 'mystery', level: 'POTENTIAL', bufferMinutes: null })
    // full 60m delay still gets applied against dinner's buffer (30m) since
    // the mystery segment couldn't absorb any of it
    expect(impacts[1]).toMatchObject({ segmentId: 'dinner', level: 'DIRECT' })
  })
})

describe('calculateCancellationImpact', () => {
  it('marks every segment after the cancelled one DIRECT', () => {
    const flight = seg('flight', 0, base, base)
    const transfer = seg('transfer', 1, new Date(base.getTime() + HOUR), null, 'TAXI')
    const hotel = seg('hotel', 2, new Date(base.getTime() + 2 * HOUR), null, 'HOTEL')

    const impacts = calculateCancellationImpact([flight, transfer, hotel], 'flight')
    expect(impacts).toEqual([
      { segmentId: 'transfer', level: 'DIRECT', bufferMinutes: null, shiftedStart: null, reason: 'The segment it connects from was cancelled.' },
      { segmentId: 'hotel', level: 'DIRECT', bufferMinutes: null, shiftedStart: null, reason: 'The segment it connects from was cancelled.' },
    ])
  })

  it('ignores segments before the cancelled one and returns nothing for an unknown id', () => {
    const hotel = seg('hotel', 0, base, base, 'HOTEL')
    const flight = seg('flight', 1, new Date(base.getTime() + HOUR), null)
    expect(calculateCancellationImpact([hotel, flight], 'flight')).toEqual([])
    expect(calculateCancellationImpact([hotel, flight], 'missing')).toEqual([])
  })
})

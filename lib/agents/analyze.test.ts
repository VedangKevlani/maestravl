import { describe, it, expect } from 'vitest'
import { planAnalysis, type PlannerSegment } from './analyze'

const HOUR = 60 * 60 * 1000
const base = new Date('2026-12-15T12:00:00Z')

function seg(id: string, order: number, departureTime: Date | null, arrivalTime: Date | null, overrides: Partial<PlannerSegment> = {}): PlannerSegment {
  return {
    id,
    order,
    transportType: 'FLIGHT',
    departureTime,
    arrivalTime,
    identifier: null,
    provider: null,
    departureLocationCode: null,
    arrivalLocationCode: null,
    ...overrides,
  }
}

describe('planAnalysis', () => {
  it('returns COMPLETED with no affected segments when nothing downstream is threatened', () => {
    const flight = seg('flight', 0, base, base, { identifier: 'AA123' })
    const dinner = seg('dinner', 1, new Date(base.getTime() + 6 * HOUR), null, { provider: 'Ocean Grill' })

    const plan = planAnalysis(flight, [flight, dinner], 'DELAYED', 30)
    expect(plan.outcome).toBe('COMPLETED')
    expect(plan.affected).toEqual([])
    expect(plan.actions.some((a) => a.type === 'VERIFY')).toBe(true)
    expect(plan.actions.some((a) => a.type === 'ESCALATE')).toBe(false)
  })

  it('returns ACTION_REQUIRED and logs one action per affected segment for a delay', () => {
    const flight = seg('flight', 0, base, base, { identifier: 'AA123' })
    const transfer = seg('transfer', 1, new Date(base.getTime() + 30 * 60 * 1000), null, { provider: 'Island Transfers', transportType: 'TAXI' })

    const plan = planAnalysis(flight, [flight, transfer], 'DELAYED', 240)
    expect(plan.outcome).toBe('ACTION_REQUIRED')
    expect(plan.affected).toHaveLength(1)
    expect(plan.affected[0].segmentId).toBe('transfer')
    expect(plan.actions.find((a) => a.segmentId === 'transfer')?.description).toContain('Island Transfers')
    expect(plan.actions.some((a) => a.type === 'ESCALATE')).toBe(true)
  })

  it('treats a cancellation as affecting every downstream segment regardless of delayMinutes', () => {
    const flight = seg('flight', 0, base, base)
    const transfer = seg('transfer', 1, new Date(base.getTime() + HOUR), null, { transportType: 'TAXI' })
    const hotel = seg('hotel', 2, new Date(base.getTime() + 2 * HOUR), null, { transportType: 'HOTEL' })

    const plan = planAnalysis(flight, [flight, transfer, hotel], 'CANCELLED', null)
    expect(plan.outcome).toBe('ACTION_REQUIRED')
    expect(plan.affected.map((a) => a.segmentId)).toEqual(['transfer', 'hotel'])
  })

  it('produces no affected segments for a delay with no delayMinutes', () => {
    const flight = seg('flight', 0, base, base)
    const transfer = seg('transfer', 1, new Date(base.getTime() + 30 * 60 * 1000), null, { transportType: 'TAXI' })
    const plan = planAnalysis(flight, [flight, transfer], 'DELAYED', null)
    expect(plan.outcome).toBe('COMPLETED')
  })
})

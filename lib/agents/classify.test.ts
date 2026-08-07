import { describe, it, expect } from 'vitest'
import { classifyDisruption, DISRUPTION_DELAY_THRESHOLD_MINUTES } from './classify'

describe('classifyDisruption', () => {
  it('always classifies a cancellation as HIGH severity, regardless of delay data', () => {
    expect(classifyDisruption('CANCELLED', null)).toEqual({ severity: 'HIGH' })
    expect(classifyDisruption('CANCELLED', 0)).toEqual({ severity: 'HIGH' })
  })

  it('ignores delays shorter than the noise threshold', () => {
    expect(classifyDisruption('DELAYED', DISRUPTION_DELAY_THRESHOLD_MINUTES - 1)).toBeNull()
    expect(classifyDisruption('DELAYED', 0)).toBeNull()
    expect(classifyDisruption('DELAYED', null)).toBeNull()
  })

  it('classifies delays by severity band', () => {
    expect(classifyDisruption('DELAYED', DISRUPTION_DELAY_THRESHOLD_MINUTES)).toEqual({ severity: 'LOW' })
    expect(classifyDisruption('DELAYED', 59)).toEqual({ severity: 'LOW' })
    expect(classifyDisruption('DELAYED', 60)).toEqual({ severity: 'MEDIUM' })
    expect(classifyDisruption('DELAYED', 179)).toEqual({ severity: 'MEDIUM' })
    expect(classifyDisruption('DELAYED', 180)).toEqual({ severity: 'HIGH' })
    expect(classifyDisruption('DELAYED', 500)).toEqual({ severity: 'HIGH' })
  })

  it('treats every other status as routine, not disruptive', () => {
    for (const status of ['ON_TIME', 'BOARDING', 'DEPARTED', 'ARRIVED', 'UNKNOWN'] as const) {
      expect(classifyDisruption(status, 999)).toBeNull()
    }
  })
})

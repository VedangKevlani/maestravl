import { describe, it, expect } from 'vitest'
import { extractCounterOfferTime } from './counterOffer'

// Maestravl asked for 2:00 PM New York time (18:00Z in August), fallback 3:00 PM.
const requested = new Date('2026-08-14T18:00:00Z')
const fallback = new Date('2026-08-14T19:00:00Z')
const opts = { referenceTime: requested, timezone: 'America/New_York', offeredTimes: [requested, fallback] }

describe('extractCounterOfferTime', () => {
  it('reads the one new time, on the requested day, in the segment zone', () => {
    const t = extractCounterOfferTime("Sorry, 2:00 PM is full but we could do 5:30 PM instead.", opts)
    expect(t?.toISOString()).toBe('2026-08-14T21:30:00.000Z') // 5:30 PM EDT
  })

  it('honors an explicit date in the reply', () => {
    const t = extractCounterOfferTime('We can move you to August 15 at 9am.', opts)
    expect(t?.toISOString()).toBe('2026-08-15T13:00:00.000Z')
  })

  it('returns null when the reply only repeats times Maestravl offered', () => {
    expect(extractCounterOfferTime('3:00 PM works for us.', opts)).toBeNull()
  })

  it('returns null rather than guessing between two new times', () => {
    expect(extractCounterOfferTime('We have 4pm or 6pm available.', opts)).toBeNull()
  })

  it('returns null when no hour is named', () => {
    expect(extractCounterOfferTime("We can't do that day, how about tomorrow?", opts)).toBeNull()
  })

  it('reads times in the segment zone, not the server zone', () => {
    const t = extractCounterOfferTime('Could do 5:30 PM.', { ...opts, timezone: 'America/Jamaica' })
    expect(t?.toISOString()).toBe('2026-08-14T22:30:00.000Z') // 5:30 PM Jamaica (UTC-5)
  })
})

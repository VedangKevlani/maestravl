import { describe, it, expect } from 'vitest'
import { discoverContactsInText, discoverContactsInWebResults, type WebSearchResult } from './contactDiscovery'

describe('discoverContactsInText', () => {
  it('scores an email near a contact keyword higher than a bare one', () => {
    const nearKeyword = discoverContactsInText('Reservations: frontdesk@sunsethotel.com for any changes.')
    expect(nearKeyword).toContainEqual({ channel: 'EMAIL', value: 'frontdesk@sunsethotel.com', confidence: 85 })

    const bare = discoverContactsInText('Booking confirmed. traveler@example.com Flight AA123.')
    expect(bare).toContainEqual({ channel: 'EMAIL', value: 'traveler@example.com', confidence: 60 })
  })

  it('deduplicates repeated emails case-insensitively', () => {
    const found = discoverContactsInText('Contact: HELP@Hotel.com. Also help@hotel.com again.')
    expect(found.filter((c) => c.channel === 'EMAIL')).toHaveLength(1)
  })

  it('finds a URL and scores it higher near "manage your booking"', () => {
    const found = discoverContactsInText('Manage your booking: https://provider.example/manage/ABC123')
    expect(found).toContainEqual({ channel: 'WEB_FORM', value: 'https://provider.example/manage/ABC123', confidence: 55 })
  })

  it('finds an international phone number even without a nearby keyword (the + prefix is enough)', () => {
    const found = discoverContactsInText('Front office: +1 876-555-0199 anytime.')
    expect(found).toContainEqual({ channel: 'OTHER', value: '+1 876-555-0199', confidence: 50 })
  })

  it('scores a phone number higher when it sits near a contact keyword', () => {
    const found = discoverContactsInText('Contact us: 876-555-0199 for questions.')
    expect(found).toContainEqual({ channel: 'OTHER', value: '876-555-0199', confidence: 70 })
  })

  it('ignores digit runs that are not phone numbers (confirmation codes, short prices)', () => {
    const found = discoverContactsInText('Confirmation Number: XJ7K2P9834712. Total: $45.00.')
    expect(found.filter((c) => c.channel === 'OTHER')).toHaveLength(0)
  })

  it('ignores a bare long digit run with no keyword and no + prefix', () => {
    const found = discoverContactsInText('Reference 8765550199 printed on the receipt.')
    expect(found.filter((c) => c.channel === 'OTHER')).toHaveLength(0)
  })

  it('returns nothing for text with no contact patterns', () => {
    expect(discoverContactsInText('Flight AA123 departs Kingston at 2:30 PM.')).toEqual([])
  })
})

describe('discoverContactsInWebResults', () => {
  const officialResult: WebSearchResult = {
    title: 'Sunset Hotel Jamaica — Official Site',
    url: 'https://www.sunsethoteljamaica.com/contact',
    content: 'Email reservations@sunsethoteljamaica.com for booking questions.',
  }
  const aggregatorResult: WebSearchResult = {
    title: 'Sunset Hotel Jamaica reviews and booking',
    url: 'https://travel-aggregator.example/listing/sunset-hotel-jamaica',
    content: 'Contact the property via bookings@travel-aggregator.example.',
  }

  it('boosts confidence when the result domain plausibly matches the provider name', () => {
    const found = discoverContactsInWebResults([officialResult], 'Sunset Hotel Jamaica')
    const email = found.find((c) => c.channel === 'EMAIL')
    expect(email?.value).toBe('reservations@sunsethoteljamaica.com')
    expect(email?.confidence).toBe(80)
  })

  it('caps confidence low when the result domain does not match the provider name', () => {
    const found = discoverContactsInWebResults([aggregatorResult], 'Sunset Hotel Jamaica')
    const email = found.find((c) => c.channel === 'EMAIL')
    expect(email?.value).toBe('bookings@travel-aggregator.example')
    expect(email?.confidence).toBeLessThanOrEqual(45)
  })

  it('adds the result URL itself as a WEB_FORM candidate', () => {
    const found = discoverContactsInWebResults([officialResult], 'Sunset Hotel Jamaica')
    expect(found).toContainEqual({ channel: 'WEB_FORM', value: officialResult.url, confidence: 65 })
  })

  it('never throws on a malformed URL and just treats it as unofficial', () => {
    const bad: WebSearchResult = { title: 'x', url: 'not-a-url', content: 'call@example.com' }
    expect(() => discoverContactsInWebResults([bad], 'Sunset Hotel Jamaica')).not.toThrow()
    const found = discoverContactsInWebResults([bad], 'Sunset Hotel Jamaica')
    expect(found.find((c) => c.channel === 'EMAIL')?.confidence).toBeLessThanOrEqual(45)
  })

  it('returns nothing for an empty result set', () => {
    expect(discoverContactsInWebResults([], 'Sunset Hotel Jamaica')).toEqual([])
  })
})

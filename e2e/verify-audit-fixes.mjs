// Live verification for the 2026-10-12 audit fixes. Sandboxed on purpose,
// because the dev server talks to the real database and real providers:
// - throwaway account; trip/user deleted at the end
// - no passenger email/phone, so nothing is ever notified
// - monitoring disabled on every segment, so no flight-API quota is used
// - no `provider` on any segment and a planted @example.com contact in the
//   hotel's notes, so contact discovery never falls back to paid web search
// - the contact-approval prompt is only ever DECLINED, so nothing is sent
//
//   BASE_URL=http://localhost:3100 node e2e/verify-audit-fixes.mjs
import { chromium } from 'playwright'
import assert from 'node:assert/strict'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100'
const email = `audit+${Date.now()}@example.com`
const password = 'password123'

const browser = await chromium.launch()
// Far from the segments' New York / Jamaica zones, so any browser-zone
// leak in prefill/parsing shows up as a multi-hour shift.
const context = await browser.newContext({ timezoneId: 'Asia/Kolkata', viewport: { width: 1280, height: 900 } })
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (err) => pageErrors.push(err.message))
const api = page.request

async function json(res) {
  const body = await res.json().catch(() => ({}))
  if (!res.ok()) throw new Error(`${res.url()} -> ${res.status()} ${JSON.stringify(body)}`)
  return body
}

let tripId = null
try {
  console.log('--- setup: account, trip, passenger, segments ---')
  await json(await api.post(`${BASE_URL}/api/auth/signup`, { data: { name: 'Audit Test', email, password } }))
  await page.goto(`${BASE_URL}/login`)
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type=submit]')
  await page.waitForURL('**/dashboard', { timeout: 60000 })
  await json(await api.post(`${BASE_URL}/api/user/onboarding`))
  await page.reload({ waitUntil: 'networkidle' })

  tripId = (await json(await api.post(`${BASE_URL}/api/trips`, { data: { title: 'Audit verification trip' } }))).trip.id
  const pax = (await json(await api.post(`${BASE_URL}/api/trips/${tripId}/passengers`, { data: { name: 'Audit Pax' } }))).passenger

  const FLIGHT_DEP = '2026-12-01T14:00:00.000Z' // 09:00 New York (EST)
  const FLIGHT_ARR = '2026-12-01T18:30:00.000Z' // 13:30 Jamaica
  const flight = (await json(await api.post(`${BASE_URL}/api/trips/${tripId}/segments`, {
    data: {
      transportType: 'FLIGHT', identifier: 'AUD101',
      departureLocation: 'New York', departureLocationCode: 'JFK', departureTime: FLIGHT_DEP,
      arrivalLocation: 'Montego Bay', arrivalLocationCode: 'MBJ', arrivalTime: FLIGHT_ARR,
      timezone: 'America/Chicago', monitorEnabled: false,
    },
  }))).segment
  await json(await api.post(`${BASE_URL}/api/trips/${tripId}/segments`, {
    data: {
      transportType: 'HOTEL', departureLocation: 'Montego Bay hotel',
      departureTime: '2026-12-01T20:00:00.000Z', arrivalTime: '2026-12-05T16:00:00.000Z',
      timezone: 'America/Jamaica', monitorEnabled: false,
      notes: 'Reservations: audit-provider@example.com',
    },
  }))

  // Fix 4: a foreign passenger id is dropped, not linked.
  const sneaky = (await json(await api.post(`${BASE_URL}/api/trips/${tripId}/segments`, {
    data: { transportType: 'OTHER', departureLocation: 'x', passengerIds: [pax.id, 'not-a-passenger-on-this-trip'], monitorEnabled: false },
  }))).segment
  assert.deepEqual(sneaky.passengerLinks.map((l) => l.passengerId), [pax.id], 'foreign passengerIds must be filtered out')
  await json(await api.delete(`${BASE_URL}/api/segments/${sneaky.id}`))
  console.log('ok  segment create filters passengerIds to the trip')

  await page.goto(`${BASE_URL}/trips/${tripId}`, { waitUntil: 'networkidle' })
  const flightCard = page.locator(`#seg-${flight.id}`)

  // Fix 11: no "LAST CHECKED: just now" for a never-checked segment.
  const metaText = await flightCard.locator('[class*=segMetaRow]').innerText()
  assert(!/just now/i.test(metaText), `meta row should not claim a check happened: ${metaText}`)
  console.log('ok  meta row:', metaText.split('\n')[0])

  console.log('--- Fix 6: edit form round-trips times regardless of browser zone ---')
  await flightCard.getByRole('button', { name: 'Manage', exact: true }).click()
  await page.getByRole('button', { name: /Date & Time/ }).click()
  const depTime = await page.locator('input[type=time]').first().inputValue()
  assert.equal(depTime, '09:00', 'departure should prefill in New York time (airport zone), not the browser zone')
  const arrTime = await page.locator('input[type=time]').nth(1).inputValue()
  assert.equal(arrTime, '13:30', 'arrival should prefill in Jamaica time (arrival airport zone)')
  const hint = await page.getByText(/Enter times as shown on your booking/).innerText()
  console.log('ok  prefill 09:00 / 13:30; hint:', hint.replace(/\s+/g, ' '))

  console.log('--- Fix 7: passenger selection survives the 4s background refresh ---')
  const paxPill = page.getByRole('button', { name: 'Audit Pax' })
  assert.equal(await paxPill.locator('svg').count(), 1, 'passenger should start selected')
  await paxPill.click()
  assert.equal(await paxPill.locator('svg').count(), 0, 'passenger should now be unselected')
  await page.waitForTimeout(9000) // two+ poll cycles
  assert.equal(await paxPill.locator('svg').count(), 0, 'deselection was wiped by the poll')
  await paxPill.click() // restore before saving
  console.log('ok  selection held across 9s of polling')

  // The form requires a provider; it must now say so instead of silently
  // disabling Save.
  assert(await page.getByText(/Still needed: provider name/).isVisible(), 'form should explain why Save is disabled')
  console.log('ok  disabled Save explains: provider name missing')
  await page.getByRole('button', { name: /Provider & Additional Info/ }).click()
  await page.getByPlaceholder('e.g. American Airlines, Marriott, Amtrak').fill('Audit Air')
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await page.waitForTimeout(2500)
  const after = (await json(await api.get(`${BASE_URL}/api/trips/${tripId}`))).trip.segments.find((s) => s.id === flight.id)
  assert.equal(new Date(after.departureTime).toISOString(), FLIGHT_DEP, 'saving unchanged times must not move departure')
  assert.equal(new Date(after.arrivalTime).toISOString(), FLIGHT_ARR, 'saving unchanged times must not move arrival')
  console.log('ok  saving with times untouched kept', FLIGHT_DEP, '/', FLIGHT_ARR)
  // Back to no provider, so the disruption below can never reach the paid
  // web-search contact fallback (only tried when a provider name is set).
  await json(await api.patch(`${BASE_URL}/api/segments/${flight.id}`, { data: { provider: null } }))

  console.log('--- Fix 8: DelayModal prefill, sub-threshold notice, zone-correct report ---')
  await page.goto(`${BASE_URL}/trips/${tripId}`, { waitUntil: 'networkidle' })
  await flightCard.getByRole('button', { name: 'Report Delay' }).click()
  const dialog = page.getByRole('dialog')
  assert.equal(await dialog.locator('input[type=time]').inputValue(), '09:00', 'delay modal should prefill current departure in segment zone')
  assert(await dialog.getByText("It’s cancelled").isVisible(), 'cancellation option should exist')
  await dialog.locator('input[type=time]').fill('09:10')
  await dialog.getByRole('button', { name: 'Report Delay' }).click()
  await dialog.getByRole('status').waitFor({ timeout: 20000 })
  console.log('ok  10-minute delay shows notice:', (await dialog.getByRole('status').innerText()).trim())
  await dialog.getByRole('button', { name: 'Done' }).click()

  await flightCard.getByRole('button', { name: 'Report Delay' }).click()
  await dialog.locator('input[type=time]').fill('13:30') // +4h30 in New York time
  await dialog.getByRole('button', { name: 'Report Delay' }).click()
  await dialog.waitFor({ state: 'detached', timeout: 60000 })
  const runs = await page.waitForFunction(async ([base, id]) => {
    const r = await fetch(`${base}/api/trips/${id}/activities`)
    const d = await r.json()
    return d.activities.some((a) => a.type === 'DISRUPTION') ? d.activities : null
  }, [BASE_URL, tripId], { timeout: 30000 })
  const activities = await runs.jsonValue()
  const disruption = activities.find((a) => a.type === 'DISRUPTION')
  assert.match(disruption.message, /4 hours 30 minutes/, 'delay must be computed in New York time, not the browser zone')
  console.log('ok  disruption recorded:', disruption.message)

  console.log('--- Fix 5: per-segment updates modal shows real activity ---')
  await page.goto(`${BASE_URL}/trips/${tripId}`, { waitUntil: 'networkidle' })
  await flightCard.getByRole('button', { name: /View updates for this segment/ }).click()
  await page.getByText(/Delay detected/).waitFor({ timeout: 15000 })
  const modalEntries = await page.locator('[class*=tsuBubble]').allInnerTexts()
  assert(modalEntries.length >= 2, 'expected the disruption and agent actions in the modal')
  console.log(`ok  modal shows ${modalEntries.length} entries, e.g. "${modalEntries[1]}"`)
  await page.getByRole('button', { name: 'Close' }).first().click()

  console.log('--- Fix 9: dashboard flags a run that is waiting on approval ---')
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' })
  // The one-line banner was replaced by the "Needs you" inbox (2026-10-12).
  assert(await page.getByRole('region', { name: /Needs you/ }).isVisible(), 'dashboard should list the AWAITING_APPROVAL run')
  console.log('ok  dashboard "Needs you" inbox lists the run')

  console.log('--- Fix 1: declining the contact approval actually sticks ---')
  await page.goto(`${BASE_URL}/trips/${tripId}`, { waitUntil: 'networkidle' })
  const decline = page.getByRole('button', { name: "No, I'll handle it" })
  await decline.waitFor({ timeout: 15000 })
  await decline.click()
  // The request can take several seconds on dev + a remote DB; wait for the
  // prompt to actually go, then two more poll cycles to prove it stays gone.
  await page.getByRole('button', { name: "No, I'll handle it" }).waitFor({ state: 'detached', timeout: 45000 })
  await page.waitForTimeout(9000)
  assert.equal(await page.getByRole('button', { name: "No, I'll handle it" }).count(), 0, 'approval prompt came back after declining')
  assert.equal(await page.getByRole('button', { name: 'Yes, send it' }).count(), 0, 'approval prompt came back after declining')
  const ribbon = await page.locator('[class*=runRibbon]').first().innerText()
  console.log('ok  prompt gone; ribbon now:', ribbon.split('\n')[0])

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`)
  console.log('\nALL CHECKS PASSED')
} finally {
  if (tripId) await api.delete(`${BASE_URL}/api/trips/${tripId}`).catch(() => {})
  await browser.close()
  console.log(`(cleanup: trip deleted; delete user ${email} separately)`)
  process.stdout.write(`AUDIT_TEST_EMAIL=${email}\n`)
}

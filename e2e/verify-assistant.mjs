// Live check of the expanded assistant (app/api/voice) against the REAL
// models and lookups: Groq (free tier), MET Norway, Wikipedia, ExchangeRate-
// API, OpenStreetMap. Sandboxed: throwaway account (deleted at the end),
// monitoring off, no passenger contacts, and every proposed change is
// either just inspected or — once — confirmed for a harmless seat change.
// Nothing is emailed or sent.
//
// Paced (~25s between turns): Groq's free tier allows 8,000 tokens/minute
// per model and a turn uses ~9k across both. Model wording varies, so the
// hard checks are on structured output (cards, navigation, sources).
//
//   BASE_URL=http://localhost:3100 node e2e/verify-assistant.mjs
import 'dotenv/config'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import prismaPkg from '@prisma/client'

const prisma = new prismaPkg.PrismaClient()
const BASE_URL = process.env.BASE_URL || 'http://localhost:3100'
const email = `audit+assistant${Date.now()}@example.com`
const ip = `203.0.113.${(Date.now() % 250) + 1}`
const PACE_MS = 25_000
const day = 864e5
const hr = 36e5

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/New_York' })
const page = await context.newPage()
const failures = []
const ok = (m) => console.log('ok  ', m)
async function check(name, fn) {
  try {
    await fn()
  } catch (err) {
    failures.push(`${name}: ${err.message.split('\n')[0]}`)
    console.log('FAIL', name, '—', err.message.split('\n')[0])
  }
}

let lastTurnAt = 0
async function ask(transcript, tripId = null) {
  const wait = lastTurnAt + PACE_MS - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await page.request.post(`${BASE_URL}/api/voice`, { data: { transcript, history: [], tripId }, timeout: 120_000 })
    lastTurnAt = Date.now()
    const data = await res.json()
    const limited = data.reply?.match(/give me about (\d+) seconds/)
    if (limited && attempt < 3) {
      console.log(`     (free-tier limit hit — waiting ${limited[1]}s as the assistant asked)`)
      await new Promise((r) => setTimeout(r, (Number(limited[1]) + 5) * 1000))
      continue
    }
    console.log(`     you: ${transcript}\n     maestro: ${data.reply}`)
    return data
  }
}

try {
  await page.request.post(`${BASE_URL}/api/auth/signup`, { data: { name: 'Ada Tester', email, password: 'password123' }, headers: { 'x-real-ip': ip } })
  await page.goto(`${BASE_URL}/login`)
  await page.fill('#email', email)
  await page.fill('#password', 'password123')
  await page.click('button[type=submit]')
  await page.waitForURL('**/dashboard', { timeout: 150_000 })
  await page.request.post(`${BASE_URL}/api/user/onboarding`)
  await page.request.patch(`${BASE_URL}/api/user`, { data: { homeTimezone: 'America/New_York' } })

  const api = page.request
  const mkTrip = async (title) => (await (await api.post(`${BASE_URL}/api/trips`, { data: { title } })).json()).trip
  const seg = async (tripId, data) => (await (await api.post(`${BASE_URL}/api/trips/${tripId}/segments`, { data: { monitorEnabled: false, ...data } })).json()).segment
  const iso = (ms) => new Date(Date.now() + ms).toISOString()

  const jamaica = await mkTrip('Jamaica Winter Break')
  const flight = await seg(jamaica.id, { transportType: 'FLIGHT', identifier: 'AUD101', departureLocation: 'New York', departureLocationCode: 'JFK', departureTime: iso(3 * day), arrivalLocation: 'Montego Bay', arrivalLocationCode: 'MBJ', arrivalTime: iso(3 * day + 4 * hr) })
  // A 20-minute, cross-airport connection — something for the itinerary check to find.
  await seg(jamaica.id, { transportType: 'FLIGHT', identifier: 'AUD202', departureLocation: 'Kingston', departureLocationCode: 'KIN', departureTime: iso(3 * day + 4 * hr + 20 * 60e3), arrivalLocation: 'Miami', arrivalLocationCode: 'MIA', arrivalTime: iso(3 * day + 6 * hr) })
  await seg(jamaica.id, { transportType: 'HOTEL', departureLocation: 'Rose Hall, Montego Bay, Jamaica', timezone: 'America/Jamaica', departureTime: iso(3 * day + 7 * hr), arrivalTime: iso(7 * day) })
  const london = await mkTrip('London Work Trip')
  await seg(london.id, { transportType: 'FLIGHT', identifier: 'AUD303', departureLocation: 'New York', departureLocationCode: 'JFK', departureTime: iso(30 * day), arrivalLocation: 'London', arrivalLocationCode: 'LHR', arrivalTime: iso(30 * day + 7 * hr) })

  console.log('--- across trips (no trip page open) ---')
  await check('lists trips', async () => {
    const r = await ask('What trips do I have coming up?')
    assert(/jamaica/i.test(r.reply) && /london/i.test(r.reply), 'reply should name both trips')
    ok('names both trips')
  })
  await check('navigates to another trip\'s map', async () => {
    const r = await ask('Open the map for my London trip.')
    assert.deepEqual({ kind: r.navigation?.kind, tripId: r.navigation?.tripId }, { kind: 'trip_map', tripId: london.id })
    ok(`navigation → trip_map for the London trip`)
  })

  console.log('--- around the trip ---')
  await check('weather', async () => {
    const r = await ask("What's the weather going to be like when I land in Montego Bay?", jamaica.id)
    assert(r.attributions?.some((a) => /MET Norway/.test(a.text)), 'should use and credit MET Norway')
    // Spoken style: numbers may come as words.
    assert(/degree|°/i.test(r.reply), 'should include temperatures')
    assert(!/monte carlo/i.test(r.reply), 'must keep the real place name')
    ok('forecast from MET Norway, credited')
  })
  await check('currency', async () => {
    const r = await ask('How much is 100 US dollars in Jamaican dollars?', jamaica.id)
    assert(r.attributions?.some((a) => /Exchange Rate API/.test(a.text)), 'should credit ExchangeRate-API')
    assert(/1[0-9],?[0-9]{3}|(fifteen|sixteen) thousand/i.test(r.reply), 'should quote roughly 15-16 thousand JMD')
    ok('conversion at daily rates, credited')
  })
  await check('nearby places', async () => {
    const r = await ask("What's interesting near my hotel?", jamaica.id)
    assert(r.attributions?.some((a) => /Wikipedia/.test(a.text)), 'should credit Wikipedia')
    ok('nearby places from Wikipedia, credited')
  })
  await check('local time', async () => {
    const r = await ask("What time is it in London right now, and how far ahead of home is that?", jamaica.id)
    assert(/five hours|5 hours|\bfive\b|\b5\b/i.test(r.reply), 'London is 5 hours ahead of New York in October')
    ok('local time and difference from home')
  })
  await check('itinerary check', async () => {
    const r = await ask('Is there anything wrong with my itinerary?', jamaica.id)
    assert(/20 minutes|twenty minutes|tight|KIN|Kingston|different airport/i.test(r.reply), 'should mention the tight cross-airport connection')
    ok('spots the tight, cross-airport connection')
  })

  console.log('--- prepared actions (nothing happens without a tap) ---')
  await check('add passenger is only proposed', async () => {
    const before = await prisma.passenger.count({ where: { tripId: jamaica.id } })
    const r = await ask('Add a passenger named Grace Hopper to this trip. She has no email or phone.', jamaica.id)
    assert.equal(r.proposedAction?.kind, 'add_passenger')
    assert.equal(r.proposedAction?.passenger?.name, 'Grace Hopper')
    assert.equal(await prisma.passenger.count({ where: { tripId: jamaica.id } }), before, 'nothing may be added before the tap')
    ok('add_passenger card prepared; passenger not added')
  })

  console.log('--- in the chat UI: suggestion, navigation, confirm a card ---')
  await check('chat works from the dashboard, follows you, and confirms a change', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load' })
    await page.getByRole('button', { name: 'Chat with Maestro' }).click()
    const wait = lastTurnAt + PACE_MS - Date.now()
    if (wait > 0) await page.waitForTimeout(wait)
    await page.getByPlaceholder('Message Maestro…').fill('Take me to the map for my Jamaica trip.')
    await page.getByRole('button', { name: 'Send message' }).click()
    await page.waitForURL(`**/trips/${jamaica.id}/map`, { timeout: 120_000 })
    lastTurnAt = Date.now()
    assert(await page.getByText('Take me to the map for my Jamaica trip.').isVisible(), 'conversation should survive the navigation')
    ok('navigated to the Jamaica map with the conversation intact')

    await page.waitForTimeout(PACE_MS)
    await page.getByPlaceholder('Message Maestro…').fill('Change my seat on AUD101 to 22A.')
    await page.getByRole('button', { name: 'Send message' }).click()
    const card = page.getByRole('group', { name: 'Action waiting for your confirmation' })
    await card.waitFor({ timeout: 120_000 })
    assert.match(await card.innerText(), /seat to "22A"/)
    assert.equal((await prisma.segment.findUnique({ where: { id: flight.id } })).seat, null, 'no change before the tap')
    await card.getByRole('button', { name: 'Confirm' }).click()
    await card.getByText(/Done — updated/).waitFor({ timeout: 60_000 })
    assert.equal((await prisma.segment.findUnique({ where: { id: flight.id } })).seat, '22A')
    ok('seat card confirmed by tap → saved as 22A')
  })

  if (failures.length) throw new Error(`${failures.length} check(s) failed`)
  console.log('\nALL CHECKS PASSED')
} catch (err) {
  console.log('\nFAILURES:\n - ' + (failures.length ? failures.join('\n - ') : err.message))
  process.exitCode = 1
} finally {
  const testUser = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  await prisma.user.deleteMany({ where: { email } })
  // Only this test user's buckets — never anyone else's.
  await prisma.rateLimitBucket.deleteMany({ where: { key: { in: [`signup:ip:${ip}`, ...(testUser ? [`voice:user:${testUser.id}`] : [])] } } })
  await prisma.$disconnect()
  await browser.close()
  console.log('(cleanup: test user, trips and rate-limit buckets deleted)')
}

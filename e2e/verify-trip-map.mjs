// Live check of the trip map view (app/(app)/trips/[id]/map). Sandboxed:
// throwaway account (deleted at the end), monitoring off, no passenger
// contacts, no disruption reported — nothing external is contacted except
// the free map/geocoding/Wikipedia services the page itself uses.
// The browser's location is simulated with Playwright's geolocation.
//
//   BASE_URL=http://localhost:3100 node e2e/verify-trip-map.mjs
import 'dotenv/config'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import prismaPkg from '@prisma/client'

const prisma = new prismaPkg.PrismaClient()
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output')
const BASE_URL = process.env.BASE_URL || 'http://localhost:3100'
const email = `audit+map${Date.now()}@example.com`
const ip = `203.0.113.${(Date.now() % 250) + 1}`
const JFK = { latitude: 40.6413, longitude: -73.7781 }

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  timezoneId: 'America/New_York',
  permissions: ['geolocation'],
  geolocation: JFK,
  // No context-wide x-real-ip header: the browser would attach it to
  // cross-origin requests too (tiles, fonts, Wikipedia), turning them into
  // CORS preflights those servers reject. It's only set on the signup call.
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)) })
page.on('requestfailed', (r) => consoleErrors.push(`request failed: ${r.url().slice(0, 120)} ${r.failure()?.errorText}`))
const ok = (m) => console.log('ok  ', m)

try {
  await page.request.post(`${BASE_URL}/api/auth/signup`, { data: { name: 'Map Tester', email, password: 'password123' }, headers: { 'x-real-ip': ip } })
  await page.goto(`${BASE_URL}/login`)
  await page.fill('#email', email)
  await page.fill('#password', 'password123')
  await page.click('button[type=submit]')
  await page.waitForURL('**/dashboard', { timeout: 60000 })
  await page.request.post(`${BASE_URL}/api/user/onboarding`)

  const api = page.request
  const now = Date.now()
  const iso = (ms) => new Date(now + ms).toISOString()
  const H = 3600_000
  const trip = (await (await api.post(`${BASE_URL}/api/trips`, { data: { title: 'Map check: New York → Montego Bay' } })).json()).trip
  const seg = async (data) => (await (await api.post(`${BASE_URL}/api/trips/${trip.id}/segments`, { data: { monitorEnabled: false, ...data } })).json()).segment
  // In the air right now: departed an hour ago, lands in two hours.
  const flight = await seg({ transportType: 'FLIGHT', identifier: 'AUD101', departureLocation: 'New York', departureLocationCode: 'JFK', departureTime: iso(-1 * H), arrivalLocation: 'Montego Bay', arrivalLocationCode: 'MBJ', arrivalTime: iso(2 * H) })
  const hotel = await seg({ transportType: 'HOTEL', departureLocation: 'Rose Hall, Montego Bay, Jamaica', timezone: 'America/Jamaica', departureTime: iso(4 * H), arrivalTime: iso(4 * 24 * H) })
  await seg({ transportType: 'FLIGHT', identifier: 'AUD202', departureLocation: 'Montego Bay', departureLocationCode: 'MBJ', departureTime: iso(4 * 24 * H + 3 * H), arrivalLocation: 'New York', arrivalLocationCode: 'JFK', arrivalTime: iso(4 * 24 * H + 7 * H) })

  console.log('--- menu bar button opens the map ---')
  await page.goto(`${BASE_URL}/trips/${trip.id}`, { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: 'Open map view' }).click()
  await page.waitForURL(`**/trips/${trip.id}/map`)
  await page.locator('.maplibregl-canvas').waitFor({ timeout: 30000 })
  ok('header globe button → /map, WebGL canvas rendered')

  console.log('--- markers, estimated vehicle, geocoded hotel ---')
  await page.getByRole('button', { name: /AUD101/ }).first().waitFor({ timeout: 20000 })
  await page.getByRole('img', { name: /AUD101 .*estimated position from its schedule/ }).waitFor({ timeout: 20000 })
  ok('airport markers and the in-flight estimated-position marker are on the map')
  // The route itself must actually render (it didn't until the worker fix).
  const rendered = await page.waitForFunction(() => {
    const m = window.__maestravlMap
    return m && m.getLayer('trip-routes-air') && m.queryRenderedFeatures({ layers: ['trip-routes-air'] }).length > 0
  }, null, { timeout: 30000 }).then(() => true).catch(() => false)
  assert(rendered, 'flight route arc should render')
  ok('flight route arc rendered on the globe')
  await page.getByRole('button', { name: /Hotel · Rose Hall/ }).first().waitFor({ timeout: 30000 })
  ok('hotel address geocoded (OpenStreetMap) and placed on the map')

  console.log('--- right-now panel: underway, not aboard (we are at JFK) ---')
  await page.getByRole('heading', { name: 'Right now' }).waitFor()
  await page.getByRole('button', { name: 'Use my location' }).click()
  await page.getByText(/is in progress/).waitFor({ timeout: 20000 })
  await page.getByText(/not near its estimated position/).waitFor({ timeout: 20000 })
  ok('in-progress flight shown as an estimate; standing at JFK reads as "not aboard"')
  await page.screenshot({ path: path.join(OUT, 'trip-map-at-jfk.png') })

  console.log('--- move "aboard": location at the estimated position ---')
  // Roughly one third of the way JFK → MBJ along the great circle.
  await context.setGeolocation({ latitude: 33.4, longitude: -75.2 })
  await page.getByText(/looks like you’re on it/).waitFor({ timeout: 30000 })
  ok('moving to the estimated position reads as "on it"')

  console.log('--- arrive at the hotel ---')
  await context.setGeolocation({ latitude: 18.5085, longitude: -77.8455 })
  const geocodedHotel = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.includes('rose hall')) return JSON.parse(localStorage.getItem(k))
    }
    return null
  })
  assert(geocodedHotel, 'hotel geocode should be cached')
  await context.setGeolocation({ latitude: geocodedHotel.lat, longitude: geocodedHotel.lng })
  await page.getByText(/You're at Rose Hall, Montego Bay, Jamaica — your hotel/).waitFor({ timeout: 30000 })
  ok(`at the hotel's geocoded point (${geocodedHotel.lat.toFixed(4)}, ${geocodedHotel.lng.toFixed(4)}) → "You're at Hotel · Rose Hall…"`)

  console.log('--- landmarks, satellite, boarding pass switching ---')
  const lm = page.locator('ul').filter({ has: page.locator('a[href*="wikipedia.org"]') })
  await lm.first().waitFor({ timeout: 30000 })
  ok(`nearby landmarks: ${(await lm.first().locator('a').allInnerTexts()).slice(0, 3).join(' · ')}`)

  await page.getByRole('button', { name: 'Satellite' }).click()
  await page.waitForTimeout(4000)
  assert.equal(await page.getByRole('button', { name: 'Satellite' }).getAttribute('aria-pressed'), 'true')
  await page.screenshot({ path: path.join(OUT, 'trip-map-satellite.png') })
  ok('satellite imagery style applied')

  await page.getByRole('tab', { name: /AUD202/ }).click()
  await page.locator(`#seg-${flight.id}`).waitFor({ state: 'detached', timeout: 10000 })
  assert.equal(await page.getByRole('button', { name: 'Drag to reorder' }).count(), 0, 'no drag handle on the map')
  assert(await page.getByRole('button', { name: 'Report Delay' }).isVisible(), 'the real BoardingPass actions are present')
  ok('segment strip switches the real boarding pass (Report Delay, Manage…), no drag handle')
  void hotel

  // Phone width: panels must stay usable and nothing should scroll sideways.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'load' }) // what a phone actually sees on first load
  await page.locator('.maplibregl-canvas').waitFor({ timeout: 30000 })
  await page.waitForTimeout(5000)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  assert(overflow <= 1, `no horizontal page scroll at phone width (overflow ${overflow}px)`)
  await page.screenshot({ path: path.join(OUT, 'trip-map-phone.png') })
  ok('phone width: no horizontal scroll')
  await page.setViewportSize({ width: 1400, height: 900 })

  await page.getByRole('link', { name: 'Back to timeline view' }).click()
  await page.waitForURL(`**/trips/${trip.id}`)
  ok('header list button returns to the timeline')

  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`)
  console.log('\nALL CHECKS PASSED')
} catch (err) {
  console.log('\nFAIL:', err.message.split('\n')[0])
  if (errors.length) console.log('page errors:', errors)
  console.log('console errors:', [...new Set(consoleErrors)].slice(0, 12))
  await page.screenshot({ path: path.join(OUT, 'trip-map-failure.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  await prisma.user.deleteMany({ where: { email } })
  await prisma.rateLimitBucket.deleteMany({ where: { key: `signup:ip:${ip}` } })
  await prisma.$disconnect()
  await browser.close()
  console.log('(cleanup: test user, trip and rate-limit bucket deleted)')
}

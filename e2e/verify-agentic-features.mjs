// Live verification for the 2026-10-12 follow-up work: rate limiting,
// developer-only System status + profile menu, the Trip Updates tab, and
// the Tier 1-3 agentic features. Same sandboxing as verify-audit-fixes.mjs
// because the dev server talks to the real database and real providers:
// - throwaway accounts, deleted at the end (plus their rate-limit buckets)
// - rate-limit tests use TEST-NET addresses (203.0.113.x), never real IPs
// - no passenger email/phone, so nobody is ever notified
// - monitoring off, no provider names, contacts planted as @example.com,
//   so no flight-API quota and no paid web search
// - every provider contact is DECLINED or rejected by validation — nothing
//   is ever sent
// - the one voice turn uses Groq's free tier (a few requests)
//
// Needs a dev server started with audit-admin@example.com in ADMIN_EMAILS:
//   ADMIN_EMAILS="you@x.com,audit-admin@example.com" npx next dev -p 3100
//   BASE_URL=http://localhost:3100 node e2e/verify-agentic-features.mjs
import 'dotenv/config'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import prismaPkg from '@prisma/client'

const { PrismaClient } = prismaPkg
const prisma = new PrismaClient()
const BASE_URL = process.env.BASE_URL || 'http://localhost:3100'
const stamp = Date.now()
const email = `audit+${stamp}@example.com`
const adminEmail = 'audit-admin@example.com'
const lockoutEmail = `nobody+${stamp}@example.com`
const password = 'password123'
const testIp = (n) => `203.0.113.${(stamp + n) % 250 + 1}`
const createdEmails = [email, adminEmail]
const rateLimitKeys = []

const browser = await chromium.launch()
const failures = []
const ok = (msg) => console.log('ok  ', msg)
async function check(name, fn) {
  try {
    await fn()
  } catch (err) {
    failures.push(`${name}: ${err.message.split('\n')[0]}`)
    console.log('FAIL', name, '—', err.message.split('\n')[0])
  }
}

async function newUserPage(userEmail, ip) {
  // x-real-ip only on the signup call — set context-wide, the browser would
  // attach it to cross-origin requests (fonts, tiles) and break their CORS.
  const context = await browser.newContext({ timezoneId: 'Asia/Kolkata', viewport: { width: 1280, height: 900 } })
  rateLimitKeys.push(`signup:ip:${ip}`)
  const page = await context.newPage()
  page.on('pageerror', (err) => failures.push(`page error: ${err.message}`))
  const signup = await page.request.post(`${BASE_URL}/api/auth/signup`, { data: { name: 'Audit Tester', email: userEmail, password }, headers: { 'x-real-ip': ip } })
  assert([201, 409].includes(signup.status()), `signup ${signup.status()}`)
  await page.goto(`${BASE_URL}/login`)
  await page.fill('#email', userEmail)
  await page.fill('#password', password)
  await page.click('button[type=submit]')
  await page.waitForURL('**/dashboard', { timeout: 60000 })
  await page.request.post(`${BASE_URL}/api/user/onboarding`)
  await page.reload({ waitUntil: 'networkidle' })
  return page
}

// Requests here can take several seconds (dev compile + a remote database),
// so wait on the actual state instead of a fixed sleep.
async function until(what, fn, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await fn()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 500))
  }
}

async function json(res) {
  const body = await res.json().catch(() => ({}))
  if (!res.ok()) throw new Error(`${res.url()} -> ${res.status()} ${JSON.stringify(body)}`)
  return body
}

let tripId = null
let page = null
try {
  // ---------------------------------------------------------------- rate limits
  console.log('--- Rate limiting ---')
  const anon = await browser.newContext()
  await check('signup is limited per IP', async () => {
    const ip = testIp(1)
    rateLimitKeys.push(`signup:ip:${ip}`)
    const statuses = []
    for (let i = 0; i < 6; i++) {
      const res = await anon.request.post(`${BASE_URL}/api/auth/signup`, { data: { name: '', email: 'bad', password: 'x' }, headers: { 'x-real-ip': ip } })
      statuses.push(res.status())
    }
    assert.deepEqual(statuses, [400, 400, 400, 400, 400, 429])
    ok('signup: 5 attempts allowed, 6th refused with 429')
  })
  await check('password reset is limited per IP', async () => {
    const ip = testIp(2)
    rateLimitKeys.push(`reset:ip:${ip}`, `reset:email:${lockoutEmail}`)
    const statuses = []
    for (let i = 0; i < 6; i++) {
      const res = await anon.request.post(`${BASE_URL}/api/auth/forgot-password`, { data: { email: lockoutEmail }, headers: { 'x-real-ip': ip } })
      statuses.push(res.status())
    }
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429])
    ok('forgot-password: 5 allowed, 6th refused (no account, so no email sent)')
  })
  await check('login locks an account after repeated failures', async () => {
    const ip = testIp(3)
    rateLimitKeys.push(`login:ip:${ip}`, `login:email:${lockoutEmail}`)
    const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-real-ip': ip } })
    const p = await ctx.newPage()
    await p.goto(`${BASE_URL}/login`)
    for (let i = 0; i < 9; i++) {
      await p.fill('#email', lockoutEmail)
      await p.fill('#password', `wrong-${i}`)
      await p.click('button[type=submit]')
      // Wait for this attempt to finish (the button re-enables) before reading
      // the message, so the previous attempt's text is never read by mistake.
      await p.waitForFunction(() => !document.querySelector('button[type=submit]')?.hasAttribute('disabled'), null, { timeout: 30000 })
      await p.locator('form [role=alert]').waitFor({ timeout: 20000 })
      const text = await p.locator('form [role=alert]').innerText()
      if (i < 8) assert.match(text, /Incorrect email or password/, `attempt ${i + 1}`)
      else assert.match(text, /Too many unsuccessful sign-in attempts/, 'attempt 9 should be locked out')
    }
    await ctx.close()
    ok('login: 8 failures show "Incorrect…", the 9th shows the lockout message')
  })

  // ------------------------------------------------- admin gating + profile menu
  console.log('--- Developer-only System status + profile menu ---')
  page = await newUserPage(email, testIp(10))
  await check('non-developer cannot see System status', async () => {
    await page.getByRole('button', { name: /Account menu for/ }).click()
    const items = await page.getByRole('menuitem').allInnerTexts()
    assert(items.some((t) => /Sign out/.test(t)) && items.some((t) => /Take the tour/.test(t)), `menu items: ${items}`)
    assert(!items.some((t) => /System status/.test(t)), 'System status must be hidden for non-developers')
    await page.keyboard.press('Escape')
    const pageRes = await page.goto(`${BASE_URL}/system-health`)
    assert.equal(pageRes.status(), 404)
    assert.equal((await page.request.get(`${BASE_URL}/api/system/health`)).status(), 404)
    ok(`profile menu shows [${items.map((t) => t.replace(/\s+/g, ' ').trim()).join(' | ')}]; /system-health and its API are 404`)
  })
  await check('developer sees System status', async () => {
    const adminPage = await newUserPage(adminEmail, testIp(11))
    await adminPage.getByRole('button', { name: /Account menu for/ }).click()
    assert(await adminPage.getByRole('menuitem', { name: /System status/ }).isVisible())
    const res = await adminPage.goto(`${BASE_URL}/system-health`, { waitUntil: 'networkidle' })
    assert.equal(res.status(), 200)
    assert((await json(await adminPage.request.get(`${BASE_URL}/api/system/health`))).integrations.length > 0)
    await adminPage.context().close()
    ok('developer account: menu entry visible, page and API load')
  })

  // ------------------------------------------------------------------- trip setup
  console.log('--- Trip setup ---')
  const api = page.request
  tripId = (await json(await api.post(`${BASE_URL}/api/trips`, { data: { title: 'Agentic verification trip' } }))).trip.id
  await json(await api.post(`${BASE_URL}/api/trips/${tripId}/passengers`, { data: { name: 'Audit Pax' } }))
  const seg = async (data) => (await json(await api.post(`${BASE_URL}/api/trips/${tripId}/segments`, { data: { monitorEnabled: false, ...data } }))).segment
  const flight = await seg({ transportType: 'FLIGHT', identifier: 'AUD101', departureLocation: 'New York', departureLocationCode: 'JFK', departureTime: '2026-12-01T14:00:00.000Z', arrivalLocation: 'Montego Bay', arrivalLocationCode: 'MBJ', arrivalTime: '2026-12-01T18:30:00.000Z' })
  await seg({ transportType: 'FLIGHT', identifier: 'AUD202', departureLocation: 'Kingston', departureLocationCode: 'KIN', departureTime: '2026-12-01T18:50:00.000Z', arrivalLocation: 'Miami', arrivalLocationCode: 'MIA', arrivalTime: '2026-12-01T20:30:00.000Z' })
  const hotel = await seg({
    transportType: 'HOTEL', departureLocation: 'Montego Bay hotel', timezone: 'America/Jamaica',
    departureTime: '2026-12-01T20:00:00.000Z', arrivalTime: '2026-12-05T16:00:00.000Z',
    notes: 'Reservations: audit-res@example.com\nFront desk: audit-desk@example.com',
  })

  // --------------------------------------------------------- Tier 2: itinerary check
  await page.goto(`${BASE_URL}/trips/${tripId}`, { waitUntil: 'networkidle' })
  await check('itinerary check flags the tight, cross-airport connection', async () => {
    const banner = page.getByText(/things? in this itinerary looks? off/)
    await banner.waitFor({ timeout: 10000 })
    const text = await page.locator('[role=status]').filter({ hasText: 'itinerary' }).innerText()
    assert.match(text, /Only 20 minutes/)
    assert.match(text, /arrives at MBJ, but AUD202 \(KIN → MIA\) leaves from KIN/)
    ok('itinerary check: ' + text.split('\n')[0])
  })

  // ---------------------------------------------------- Tier 3: voice proposal
  console.log('--- Tier 3: voice/chat proposes, passenger confirms ---')
  let reportedByVoice = false
  await check('chat prepares a delay report that only runs on Confirm', async () => {
    await page.getByRole('button', { name: 'Chat with Maestro' }).click()
    await page.getByPlaceholder('Message Maestro…').fill('My flight AUD101 is delayed — the new departure time is 6:30 PM the same day. Please report the delay for me.')
    await page.getByRole('button', { name: 'Send message' }).click()
    const card = page.getByRole('group', { name: 'Action waiting for your confirmation' })
    await card.waitFor({ timeout: 90000 })
    const title = await card.innerText()
    assert.match(title, /Report AUD101 .* delayed to Dec 1, 6:30 PM, New York time/)
    // Nothing has happened yet — no disruption until Confirm.
    assert.equal(await prisma.disruption.count({ where: { tripId } }), 0, 'proposal must not act on its own')
    await card.getByRole('button', { name: 'Confirm' }).click()
    await card.getByText(/Done — delay reported/).waitFor({ timeout: 60000 })
    reportedByVoice = true
    ok('chat card: "' + title.split('\n')[1] + '" → nothing happened until Confirm, then reported')
  })
  if (!reportedByVoice) {
    console.log('     (falling back to the API so the remaining checks can run)')
    await json(await api.post(`${BASE_URL}/api/segments/${flight.id}/report-disruption`, { data: { status: 'DELAYED', newDepartureTime: '2026-12-01T23:30:00.000Z' } }))
  }

  const run = await prisma.agentRun.findFirst({ where: { tripId }, orderBy: { createdAt: 'desc' } })
  assert(run, 'a recovery run should exist')

  // ------------------------------------------------------ Tier 1: inbox + preview
  console.log('--- Tier 1: Needs-you inbox, message preview, contact picker ---')
  await check('dashboard inbox lists the pending approval with the real draft', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' })
    const inbox = page.getByRole('region', { name: /Needs you/ })
    await inbox.waitFor({ timeout: 15000 })
    await inbox.getByRole('button', { name: 'See the exact message' }).first().click()
    const preview = await inbox.innerText()
    assert.match(preview, /Hello,/)
    assert.match(preview, /Maestravl, coordinating on behalf of the passenger/)
    ok('inbox shows the approval and the exact drafted email')
  })
  await check('contact picker offers the other address on file and rejects a foreign one', async () => {
    await page.goto(`${BASE_URL}/trips/${tripId}`, { waitUntil: 'networkidle' })
    const hotelCard = page.locator(`#seg-${hotel.id}`)
    await hotelCard.getByRole('button', { name: /Send to a different address \(1 more on file\)/ }).click()
    const radios = await hotelCard.getByRole('radio').count()
    assert.equal(radios, 3, 'current + 1 other + "another address"')
    const pending = await prisma.communication.findFirst({ where: { agentRunId: run.id, segmentId: hotel.id, status: 'DRAFTED' } })
    const res = await api.post(`${BASE_URL}/api/agent-runs/${run.id}/approve-contact`, { data: { communicationId: pending.id, approve: true, contactId: 'not-on-this-segment' } })
    assert.equal(res.status(), 400)
    assert.equal((await prisma.communication.findUnique({ where: { id: pending.id } })).status, 'DRAFTED', 'a rejected override must not send')
    ok('picker lists both found addresses; a foreign contactId is refused before anything is sent')
  })

  // ---------------------------------------------- Trip Updates tab, downstream
  await check('Trip Updates tab shows activity for the downstream hotel', async () => {
    await page.goto(`${BASE_URL}/trips/${tripId}?segment=${hotel.id}&tab=updates#trip-activity`, { waitUntil: 'networkidle' })
    await page.getByText(/Showing history for/).waitFor({ timeout: 10000 })
    assert.equal(await page.getByText(/No monitoring events or agent actions yet for this segment/).count(), 0)
    const feed = await page.locator('#trip-activity').innerText()
    assert.match(feed, /audit-(res|desk)@example.com/)
    ok('filtered to the hotel, the tab shows its own entries (contact found, waiting for OK)')
  })

  // Decline the first contact (nothing sent).
  await page.goto(`${BASE_URL}/trips/${tripId}`, { waitUntil: 'networkidle' })
  await page.locator(`#seg-${hotel.id}`).getByRole('button', { name: "No, I'll handle it" }).click()
  await until('the first decline to land', async () => (await prisma.agentRun.findUnique({ where: { id: run.id } })).status !== 'AWAITING_APPROVAL')

  // ------------------------------------------------- Tier 2: follow-up drafting
  console.log('--- Tier 2: remind-on-silence ---')
  await check('a silent provider gets exactly one follow-up draft, which waits for approval', async () => {
    // Fixture: pretend the hotel request went out 7 hours ago with no reply
    // (sending it for real would email a provider).
    const original = await prisma.communication.findFirst({ where: { agentRunId: run.id, segmentId: hotel.id } })
    await prisma.communication.update({ where: { id: original.id }, data: { status: 'SENT', sentAt: new Date(Date.now() - 7 * 3600_000) } })
    await prisma.agentAction.create({ data: { agentRunId: run.id, segmentId: hotel.id, type: 'CONTACT_PROVIDER', riskLevel: 'LOW', status: 'EXECUTED', description: '(test fixture) request sent' } })
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: 'WAITING_FOR_RESPONSE' } })

    execSync('npx vitest run e2e/followup.integration.test.ts', { env: { ...process.env, RUN_DB_INTEGRATION: '1', FOLLOWUP_RUN_ID: run.id }, stdio: 'pipe' })
    assert.equal((await prisma.agentRun.findUnique({ where: { id: run.id } })).status, 'AWAITING_APPROVAL')

    await page.goto(`${BASE_URL}/trips/${tripId}`, { waitUntil: 'networkidle' })
    const hotelCard = page.locator(`#seg-${hotel.id}`)
    await hotelCard.getByText(/No reply yet to Maestravl/).waitFor({ timeout: 15000 })
    await hotelCard.getByRole('button', { name: 'See the exact message' }).click()
    assert.match(await hotelCard.innerText(), /> Hello,/, 'follow-up quotes the original')
    await hotelCard.getByRole('button', { name: "Don't follow up" }).click()
    const after = await until('the follow-up decline to land', async () => {
      const r = await prisma.agentRun.findUnique({ where: { id: run.id } })
      return r.status !== 'AWAITING_APPROVAL' ? r : null
    })
    const actions = await prisma.agentAction.findMany({ where: { agentRunId: run.id, type: 'CONTACT_PROVIDER' }, orderBy: { createdAt: 'asc' }, select: { segmentId: true, status: true, detail: true } })
    assert.equal(after.status, 'WAITING_FOR_RESPONSE', `declining a follow-up should go back to waiting — got ${after.status}; contact actions: ${JSON.stringify(actions.map((a) => [a.segmentId === hotel.id ? 'hotel' : a.segmentId, a.status, a.detail?.slice(0, 40)]))}`)
    assert.equal(await prisma.communication.count({ where: { agentRunId: run.id, status: 'SENT', sentAt: { gte: new Date(Date.now() - 3600_000) } } }), 0, 'nothing sent')
    ok('one follow-up drafted (second sweep drafted none), shown with the quoted original, declined → back to waiting')
  })

  if (failures.length) throw new Error(`${failures.length} check(s) failed`)
  console.log('\nALL CHECKS PASSED')
} catch (err) {
  console.log('\nFAILURES:\n - ' + (failures.length ? failures.join('\n - ') : err.message))
  process.exitCode = 1
} finally {
  if (tripId && page) await page.request.delete(`${BASE_URL}/api/trips/${tripId}`).catch(() => {})
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } })
  await prisma.rateLimitBucket.deleteMany({ where: { key: { in: rateLimitKeys } } })
  await prisma.$disconnect()
  await browser.close()
  console.log('(cleanup: trip, test users and test rate-limit buckets deleted)')
}

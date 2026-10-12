// Live check that the assistant really speaks with Kokoro in a browser:
// the model downloads and loads in its Web Worker, a real reply is
// synthesised sentence by sentence, and the device voice covers the gap
// before the model is ready. Uses a dev-only debug handle
// (window.__maestravlVoice, see useKokoro.ts) since headless Chrome can't be
// heard. One Groq turn; throwaway account deleted at the end.
//
//   BASE_URL=http://localhost:3100 node e2e/verify-kokoro.mjs
import 'dotenv/config'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import prismaPkg from '@prisma/client'

const prisma = new prismaPkg.PrismaClient()
const BASE_URL = process.env.BASE_URL || 'http://localhost:3100'
const email = `audit+kokoro${Date.now()}@example.com`
const ip = `203.0.113.${(Date.now() % 250) + 1}`

// Real audio output isn't needed — autoplay is allowed so the AudioContext runs.
// Installed Edge, not Playwright's bundled browser: it has WebGPU, the
// backend real desktop users get (KOKORO_BROWSER=chromium tests the CPU path).
const useEdge = process.env.KOKORO_BROWSER !== 'chromium'
const browser = await chromium.launch({ ...(useEdge ? { channel: 'msedge' } : {}), headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
// ONNX Runtime's benign "[W:onnxruntime ...] nodes not assigned to the preferred
// execution providers" warning is expected on WebGPU — anything else fails.
page.on('console', (m) => { if (m.type() === 'error' && /kokoro|onnx|wasm|worker/i.test(m.text()) && !/\[W:onnxruntime/.test(m.text())) errors.push(m.text().slice(0, 200)) })
const debug = () => page.evaluate(() => window.__maestravlVoice ?? null)

try {
  await page.request.post(`${BASE_URL}/api/auth/signup`, { data: { name: 'Voice Tester', email, password: 'password123' }, headers: { 'x-real-ip': ip } })
  await page.goto(`${BASE_URL}/login`)
  await page.fill('#email', email)
  await page.fill('#password', 'password123')
  await page.click('button[type=submit]')
  await page.waitForURL('**/dashboard', { timeout: 150_000 })
  await page.request.post(`${BASE_URL}/api/user/onboarding`)
  await page.reload({ waitUntil: 'load' })

  const iso = await page.evaluate(() => ({ isolated: self.crossOriginIsolated, cores: navigator.hardwareConcurrency }))
  console.log(`     cross-origin isolated: ${iso.isolated} | CPU cores: ${iso.cores}`)
  console.log('--- the voice switch, and the one-time download ---')
  await page.getByRole('button', { name: 'Chat with Maestro' }).click()
  const voiceGroup = page.getByRole('group', { name: 'Assistant voice' })
  await voiceGroup.waitFor()
  await voiceGroup.getByRole('button', { name: 'Natural' }).click()
  const started = Date.now()
  await page.getByText(/Downloading natural voice/).waitFor({ timeout: 30_000 })
  console.log('ok   download progress is shown while the model loads')
  await page.waitForFunction(() => window.__maestravlVoice?.readyAt, null, { timeout: 600_000, polling: 1000 })
  console.log(`ok   model downloaded, loaded and warmed up in ${Math.round((Date.now() - started) / 1000)}s on ${JSON.stringify((await debug()).backend)} (first time; cached after)`)
  assert.equal(await page.getByText(/Downloading natural voice/).count(), 0, 'progress note should clear once ready')

  console.log('--- a real reply, spoken by Kokoro ---')
  await page.getByPlaceholder('Message Maestro…').fill('What time is it in Jamaica right now?')
  await page.getByRole('button', { name: 'Send message' }).click()
  await page.waitForFunction(() => window.__maestravlVoice?.replyAt, null, { timeout: 120_000 })
  const atReply = await debug()
  assert.equal(atReply.engine, 'kokoro', 'the reply should be spoken by Kokoro once loaded')
  await page.waitForFunction(() => window.__maestravlVoice?.firstAudioAt, null, { timeout: 120_000 })
  const spoken = await debug()
  assert(!spoken.kokoroFailed, 'Kokoro synthesis should not fail')
  const reply = (await page.locator('[class*=glass-card] p').allInnerTexts()).at(-1)
  console.log(`     maestro: ${reply}`)
  console.log(`ok   Kokoro produced audio ${((spoken.firstAudioAt - spoken.replyAt) / 1000).toFixed(1)}s after the reply arrived (first sentence: ${spoken.firstChunkSeconds.toFixed(1)}s of speech)`)

  console.log('--- a second reply, with the model warm ---')
  await page.waitForFunction(() => document.querySelector('[class*=subheading]') === null, null, { timeout: 120_000 }).catch(() => {})
  await page.waitForTimeout(20_000) // let the first reply finish and Groq's minute budget recover
  await page.evaluate(() => { window.__maestravlVoice.replyAt = 0; window.__maestravlVoice.firstAudioAt = 0 })
  await page.getByPlaceholder('Message Maestro…').fill('And what time is it in London?')
  await page.getByRole('button', { name: 'Send message' }).click()
  await page.waitForFunction(() => window.__maestravlVoice?.replyAt, null, { timeout: 120_000 })
  await page.waitForFunction(() => window.__maestravlVoice?.firstAudioAt, null, { timeout: 120_000 })
  const warm = await debug()
  assert.equal(warm.engine, 'kokoro')
  console.log(`ok   warm: first audio ${((warm.firstAudioAt - warm.replyAt) / 1000).toFixed(1)}s after the reply (first sentence: ${warm.firstChunkSeconds.toFixed(1)}s of speech)`)

  assert.deepEqual(errors, [], `errors: ${errors.join(' | ')}`)
  console.log('\nALL CHECKS PASSED')
} catch (err) {
  console.log('\nFAIL:', err.message.split('\n')[0])
  console.log('debug:', JSON.stringify(await debug().catch(() => null)))
  if (errors.length) console.log('errors:', errors)
  process.exitCode = 1
} finally {
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  await prisma.user.deleteMany({ where: { email } })
  await prisma.rateLimitBucket.deleteMany({ where: { key: { in: [`signup:ip:${ip}`, ...(u ? [`voice:user:${u.id}`] : [])] } } })
  await prisma.$disconnect()
  await browser.close()
  console.log('(cleanup: test user deleted)')
}

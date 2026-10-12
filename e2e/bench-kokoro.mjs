// Benchmarks Kokoro TTS backends (CPU WebAssembly vs WebGPU, 8/16/32-bit) in
// installed Edge via the dev-only window.__kokoroBench hook (useKokoro.ts).
// The numbers behind the backend choice documented in useKokoro.ts.
//   (dev server on :3100)  node e2e/bench-kokoro.mjs
import 'dotenv/config'
import { chromium } from 'playwright'
import prismaPkg from '@prisma/client'
const prisma = new prismaPkg.PrismaClient()
const B = 'http://localhost:3100', email = `audit+bench${Date.now()}@example.com`, ip = '203.0.113.242'
const TEXT = "Your flight to Montego Bay is on time, and it lands at three ten this afternoon."
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext()).newPage()
try {
  await page.request.post(`${B}/api/auth/signup`, { data: { name: 'Bench', email, password: 'password123' }, headers: { 'x-real-ip': ip } })
  await page.goto(`${B}/login`); await page.fill('#email', email); await page.fill('#password', 'password123'); await page.click('button[type=submit]'); await page.waitForURL('**/dashboard', { timeout: 150000 })
  await page.request.post(`${B}/api/user/onboarding`); await page.reload({ waitUntil: 'load' })
  await page.getByRole('button', { name: 'Chat with Maestro' }).click() // loads the chat module (and the bench hook)
  await page.waitForFunction(() => typeof window.__kokoroBench === 'function', null, { timeout: 60000 })
  console.log('isolated:', await page.evaluate(() => self.crossOriginIsolated))
  for (const [device, dtype] of [['wasm', 'q8'], ['webgpu', 'q8'], ['webgpu', 'fp16'], ['webgpu', 'fp32']]) {
    const r = await page.evaluate(([d, t, text]) => window.__kokoroBench(d, t, text), [device, dtype, TEXT])
    const runs = r.filter((x) => x.ms).map((x) => `${(x.ms / 1000).toFixed(1)}s for ${x.seconds.toFixed(1)}s audio [peak ${x.peak.toFixed(2)} rms ${x.rms.toFixed(3)} nan ${x.nan}]`)
    console.log(`${device}/${dtype}: load ${r[0]?.loadMs ? (r[0].loadMs / 1000).toFixed(1) + 's' : '-'} | ${runs.join(' | ')}${r.find((x) => x.error) ? ' | ERROR ' + r.find((x) => x.error).error.slice(0, 120) : ''}`)
  }
} finally {
  await prisma.user.deleteMany({ where: { email } }); await prisma.rateLimitBucket.deleteMany({ where: { key: `signup:ip:${ip}` } }); await prisma.$disconnect(); await browser.close()
}

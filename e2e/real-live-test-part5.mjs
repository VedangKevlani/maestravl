// Part 5: add a real Amtrak Northeast Regional train segment to test the
// Transitland adapter end to end now that a real API key is set (and the
// route_type -> route_types bug found via direct API probing is fixed).
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TRIP_URL = process.argv[2];
if (!TRIP_URL) { console.error('Usage: node real-live-test-part5.mjs <tripUrl>'); process.exit(1); }
const LOGIN_EMAIL = 'kevlanivedang28@gmail.com';
const LOGIN_PASSWORD = process.env.TEST_LOGIN_PASSWORD;
if (!LOGIN_PASSWORD) { console.error('Set TEST_LOGIN_PASSWORD env var before running.'); process.exit(1); }

function inDaysAt(days, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(h, m, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const browser = await chromium.launch({ headless: false, slowMo: 150 });
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

console.log('--- Sign in ---');
await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
await page.fill('#email', LOGIN_EMAIL);
await page.fill('#password', LOGIN_PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL('**/dashboard', { timeout: 40000 });

await page.goto(TRIP_URL, { waitUntil: 'networkidle' });

console.log('--- Add train segment: Amtrak Northeast Regional, NYP -> BOS ---');
await page.click('button:has-text("Train")');
await page.fill('input[placeholder="e.g. Amtrak"]', 'Amtrak');
await page.fill('input[placeholder="e.g. train / route number"]', 'Northeast Regional');
await page.locator('label:has-text("Departure location") input').first().fill('New York Penn Station (NYP)');
await page.locator('label:has-text("Arrival location") input').first().fill('Boston South Station (BOS)');
{
  const timeInputs = await page.locator('input[type=datetime-local]').all();
  await timeInputs[0].fill(inDaysAt(1, '11:00'));
  await timeInputs[1].fill(inDaysAt(1, '14:35'));
}
await page.fill('label:has-text("Timezone") input', 'America/New_York');
await Promise.all([
  page.waitForResponse((r) => r.url().includes('/segments') && r.request().method() === 'POST'),
  page.click('text=Add to timeline'),
]);
await page.waitForTimeout(2500);
console.log('Train segment added.');

await page.reload({ waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(OUT, 'train_segment.png'), fullPage: true });

await browser.close();
console.log('--- DONE ---');

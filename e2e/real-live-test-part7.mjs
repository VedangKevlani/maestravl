// Part 6: trigger a fresh disruption cycle (new Communication rows, new
// reply-to addresses) now that replyInterpretation.ts is fixed, so the
// user's next reply gets read correctly by the redeployed production code.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TRIP_URL = process.argv[2];
if (!TRIP_URL) { console.error('Usage: node real-live-test-part6.mjs <tripUrl>'); process.exit(1); }
const LOGIN_EMAIL = 'kevlanivedang28@gmail.com';
const LOGIN_PASSWORD = process.env.TEST_LOGIN_PASSWORD;
if (!LOGIN_PASSWORD) { console.error('Set TEST_LOGIN_PASSWORD env var before running.'); process.exit(1); }

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

console.log('--- Report a fresh, bigger delay on AA1742 (300 min) ---');
const flight1Card = page.locator('div', { hasText: 'AA1742' }).filter({ hasText: 'Report a delay' }).last();
await flight1Card.getByText('Report a delay', { exact: true }).click();
await page.waitForTimeout(400);
const newTimeInput = flight1Card.locator('input[type=datetime-local]').first();
const pad = (n) => String(n).padStart(2, '0');
const d = new Date();
d.setHours(20, 0, 0, 0);
const newVal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
await newTimeInput.fill(newVal);
await Promise.all([
  page.waitForResponse((r) => r.url().includes('/report-disruption') && r.request().method() === 'POST'),
  flight1Card.getByText('Report delay', { exact: true }).click(),
]);
await page.waitForTimeout(2500);
console.log('Fresh delay reported (new departure:', newVal, ')');

await page.waitForTimeout(4000);
await page.reload({ waitUntil: 'networkidle' });
const viewMessages = page.getByText('View messages', { exact: false });
if (await viewMessages.count() > 0) {
  await viewMessages.first().click();
  await page.waitForTimeout(1000);
}
await page.screenshot({ path: path.join(OUT, 'fresh_disruption.png'), fullPage: true });

await browser.close();
console.log('--- DONE ---');

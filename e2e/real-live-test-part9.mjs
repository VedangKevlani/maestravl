// Part 9: click "Confirm — update itinerary" and verify the CORRECT times
// (including AA3031's fallback, 11:55 PM, not the primary 11:10 PM) land on
// the actual segments.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TRIP_URL = process.argv[2];
const LOGIN_EMAIL = 'kevlanivedang28@gmail.com';
const LOGIN_PASSWORD = process.env.TEST_LOGIN_PASSWORD;

const browser = await chromium.launch({ headless: false, slowMo: 150 });
const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });

await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
await page.fill('#email', LOGIN_EMAIL);
await page.fill('#password', LOGIN_PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL('**/dashboard', { timeout: 40000 });

await page.goto(TRIP_URL, { waitUntil: 'networkidle' });
const viewMessages = page.getByText('View messages', { exact: false });
if (await viewMessages.count() > 0) {
  await viewMessages.first().click();
  await page.waitForTimeout(1000);
}

console.log('--- Clicking Confirm — update itinerary ---');
await Promise.all([
  page.waitForResponse((r) => r.url().includes('/confirm-reschedule') && r.request().method() === 'POST'),
  page.click('text=Confirm — update itinerary'),
]);
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(OUT, 'confirmed_result.png'), fullPage: true });
console.log('Confirmed.');

await browser.close();

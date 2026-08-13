// Live verification of fix 1: report a delay, then (without resolving it)
// report a second, different delay on the same segment — confirm the first
// run flips to SUPERSEDED with a logged action, and the trip banner shows
// the second run's state, not the first's.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TRIP_URL = process.argv[2];
const LOGIN_EMAIL = 'kevlanivedang28@gmail.com';
const LOGIN_PASSWORD = process.env.TEST_LOGIN_PASSWORD;

const browser = await chromium.launch({ headless: false, slowMo: 100 });
const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });

await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
await page.fill('#email', LOGIN_EMAIL);
await page.fill('#password', LOGIN_PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL('**/dashboard', { timeout: 40000 });

await page.goto(TRIP_URL, { waitUntil: 'networkidle' });

console.log('--- Report delay #1 on the Amtrak Northeast Regional segment (previously untouched) ---');
const trainCard = page.locator('div', { hasText: 'Northeast Regional' }).filter({ hasText: 'Report a delay' }).last();
await trainCard.getByText('Report a delay', { exact: true }).click();
await page.waitForTimeout(400);
const pad = (n) => String(n).padStart(2, '0');
function isoLocal(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }

const d1 = new Date(); d1.setDate(d1.getDate() + 1); d1.setHours(12, 0, 0, 0);
await trainCard.locator('input[type=datetime-local]').first().fill(isoLocal(d1));
await Promise.all([
  page.waitForResponse((r) => r.url().includes('/report-disruption') && r.request().method() === 'POST'),
  trainCard.getByText('Report delay', { exact: true }).click(),
]);
await page.waitForTimeout(1500);
console.log('First delay reported.');

console.log('--- Report delay #2 on the SAME segment, without resolving the first ---');
await page.reload({ waitUntil: 'networkidle' });
const trainCard2 = page.locator('div', { hasText: 'Northeast Regional' }).filter({ hasText: 'Report a delay' }).last();
await trainCard2.getByText('Report a delay', { exact: true }).click();
await page.waitForTimeout(400);
const d2 = new Date(); d2.setDate(d2.getDate() + 1); d2.setHours(15, 0, 0, 0);
await trainCard2.locator('input[type=datetime-local]').first().fill(isoLocal(d2));
await Promise.all([
  page.waitForResponse((r) => r.url().includes('/report-disruption') && r.request().method() === 'POST'),
  trainCard2.getByText('Report delay', { exact: true }).click(),
]);
await page.waitForTimeout(1500);
console.log('Second delay reported.');

await page.reload({ waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(OUT, 'supersede_check.png'), fullPage: true });

await browser.close();
console.log('--- DONE ---');

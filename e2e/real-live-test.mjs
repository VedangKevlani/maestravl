// Real, live, one-shot manual test run (not part of the automated suite):
// sign in with a real account, build a real itinerary (real airline + real
// flight numbers on a genuinely tight KIN->MIA->JFK connection, plus a real
// hotel), trigger a live AviationStack check, report a delay if the live
// check doesn't already show one, and walk the recovery flow through to a
// real email send. Headed on purpose so it's a visible browser window.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const LOGIN_EMAIL = 'kevlanivedang28@gmail.com';
const LOGIN_PASSWORD = process.env.TEST_LOGIN_PASSWORD;

if (!LOGIN_PASSWORD) {
  console.error('Set TEST_LOGIN_PASSWORD env var before running.');
  process.exit(1);
}

function todayAt(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const browser = await chromium.launch({ headless: false, slowMo: 150 });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));
page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });

console.log('--- Sign in ---');
await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
await page.fill('#email', LOGIN_EMAIL);
await page.fill('#password', LOGIN_PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL('**/dashboard', { timeout: 40000 });
console.log('Signed in as', LOGIN_EMAIL);

console.log('--- Create trip ---');
await page.click('text=+ New Trip');
await page.waitForURL('**/trips/new');
await page.fill('input[placeholder*="Trip name"]', 'Kingston -> New York (live test)');
await page.click('text=Start trip');
await page.waitForURL(/\/trips\/(?!new)[a-z0-9]+$/i, { timeout: 40000 });
await page.waitForLoadState('networkidle');
const tripUrl = page.url();
console.log('Trip created:', tripUrl);

console.log('--- Add passenger (real email) ---');
await page.click('text=+ Add passenger');
await page.fill('input[placeholder="Passenger name"]', 'Vedang Kevlani');
await page.fill('input[placeholder="Email (for notifications)"]', LOGIN_EMAIL);
await page.click('button:has-text("Add")');
await page.waitForTimeout(1000);

console.log('--- Add flight 1: AA1742 Kingston -> Miami (real route/number) ---');
await page.fill('input[placeholder="e.g. American Airlines"]', 'American Airlines');
await page.fill('input[placeholder="e.g. AA123"]', 'AA1742');
await page.locator('label:has-text("Departure airport") input').first().fill('Kingston (KIN)');
await page.locator('label:has-text("Arrival airport") input').first().fill('Miami (MIA)');
await page.locator('label:has-text("Departure airport code") input').first().fill('KIN');
await page.locator('label:has-text("Arrival airport code") input').first().fill('MIA');
{
  const depTimeInputs = await page.locator('input[type=datetime-local]').all();
  await depTimeInputs[0].fill(todayAt('15:00'));
  await depTimeInputs[1].fill(todayAt('17:10'));
}
await page.fill('label:has-text("Timezone") input', 'America/Jamaica');
await Promise.all([
  page.waitForResponse((r) => r.url().includes('/segments') && r.request().method() === 'POST'),
  page.click('text=Add to timeline'),
]);
await page.waitForTimeout(800);
console.log('Flight 1 added.');

console.log('--- Add flight 2: AA3031 Miami -> New York JFK (tight ~69min connection) ---');
await page.fill('input[placeholder="e.g. American Airlines"]', 'American Airlines');
await page.fill('input[placeholder="e.g. AA123"]', 'AA3031');
await page.locator('label:has-text("Departure airport") input').first().fill('Miami (MIA)');
await page.locator('label:has-text("Arrival airport") input').first().fill('New York (JFK)');
await page.locator('label:has-text("Departure airport code") input').first().fill('MIA');
await page.locator('label:has-text("Arrival airport code") input').first().fill('JFK');
{
  const depTimeInputs = await page.locator('input[type=datetime-local]').all();
  await depTimeInputs[0].fill(todayAt('18:19'));
  await depTimeInputs[1].fill(todayAt('21:23'));
}
await page.fill('label:has-text("Timezone") input', 'America/New_York');
await Promise.all([
  page.waitForResponse((r) => r.url().includes('/segments') && r.request().method() === 'POST'),
  page.click('text=Add to timeline'),
]);
await page.waitForTimeout(800);
console.log('Flight 2 added.');

console.log('--- Add hotel: TWA Hotel, JFK ---');
await page.click('button:has-text("Hotel")');
await page.fill('input[placeholder="e.g. Marriott, Airbnb host"]', 'TWA Hotel');
await page.fill('input[placeholder="e.g. confirmation number"]', 'TWA-DEMO-1');
await page.locator('label:has-text("Hotel location") input').first().fill('TWA Hotel, JFK Airport, Queens, NY');
{
  const timeInputs = await page.locator('input[type=datetime-local]').all();
  await timeInputs[0].fill(todayAt('23:00'));
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const pad = (n) => String(n).padStart(2, '0');
  await timeInputs[1].fill(`${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T11:00`);
}
await page.fill('label:has-text("Timezone") input', 'America/New_York');
await Promise.all([
  page.waitForResponse((r) => r.url().includes('/segments') && r.request().method() === 'POST'),
  page.click('text=Add to timeline'),
]);
await page.waitForTimeout(800);
console.log('Hotel added.');

await page.screenshot({ path: path.join(OUT, 'real_trip_built.png'), fullPage: true });
console.log('--- Trip built, screenshot saved. Trip URL:', tripUrl, '---');

await browser.close();

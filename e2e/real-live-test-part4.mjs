// Part 4: add a discoverable contact to AA3031's notes (the segment that
// was actually flagged DIRECT-impacted last time but had no contact info),
// then report a fresh, bigger delay on AA1742 so the cascade re-runs with a
// contactable downstream provider this time — should actually reach
// CONTACT_PROVIDER and send a real email using the user's address as the
// stand-in airline contact.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TRIP_URL = process.argv[2];
if (!TRIP_URL) { console.error('Usage: node real-live-test-part4.mjs <tripUrl>'); process.exit(1); }
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

console.log('--- Edit AA3031: add a discoverable contact email in notes ---');
const aa3031Card = page.locator('div', { hasText: 'AA3031' }).filter({ hasText: 'Edit' }).last();
await aa3031Card.getByText('Edit', { exact: true }).click();
await page.waitForTimeout(500);
const notesField = page.locator('label:has-text("Notes") textarea').first();
await notesField.fill('Airline contact for rebooking: kevlanivedang28@gmail.com');
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(1500);
console.log('AA3031 notes updated.');

console.log('--- Report a bigger delay on AA1742 (200 min, definitely overruns AA3031 departure) ---');
const flight1Card = page.locator('div', { hasText: 'AA1742' }).filter({ hasText: 'Report a delay' }).last();
await flight1Card.getByText('Report a delay', { exact: true }).click();
await page.waitForTimeout(400);
const newTimeInput = flight1Card.locator('input[type=datetime-local]').first();

// Original AA1742 departureTime stored as 2026-08-12T20:00:00.000Z (15:00 local).
// Add 200 minutes -> 18:20 local.
const pad = (n) => String(n).padStart(2, '0');
const d = new Date();
d.setHours(18, 20, 0, 0);
const newVal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
await newTimeInput.fill(newVal);
await Promise.all([
  page.waitForResponse((r) => r.url().includes('/report-disruption') && r.request().method() === 'POST'),
  flight1Card.getByText('Report delay', { exact: true }).click(),
]);
await page.waitForTimeout(2000);
console.log('Bigger delay reported on AA1742 (new departure:', newVal, ')');

await page.waitForTimeout(5000);
await page.reload({ waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(OUT, 'after_report2.png'), fullPage: true });

const viewMessages = page.getByText('View messages', { exact: false });
if (await viewMessages.count() > 0) {
  await viewMessages.first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, 'view_messages2.png'), fullPage: true });
}

await browser.close();
console.log('--- DONE ---');

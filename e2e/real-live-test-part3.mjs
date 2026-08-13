// Part 3: add a discoverable contact to the hotel segment's notes (the
// earlier run's FIND_CONTACT correctly found nothing, since none was
// given), then report a delay on the hotel itself so a fresh AgentRun's
// contact discovery picks it up and (if confidence clears the 70 threshold)
// actually emails it as the "provider" — using the user's real address as
// the stand-in hotel contact, per their request.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TRIP_URL = process.argv[2];
if (!TRIP_URL) { console.error('Usage: node real-live-test-part3.mjs <tripUrl>'); process.exit(1); }
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

console.log('--- Edit hotel segment: add a discoverable contact email in notes ---');
const hotelCard = page.locator('div', { hasText: 'TWA-DEMO-1' }).filter({ hasText: 'Edit' }).last();
await hotelCard.getByText('Edit', { exact: true }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, 'hotel_edit_open.png'), fullPage: true });

const notesField = page.locator('label:has-text("Notes") textarea').first();
await notesField.fill('Reservation contact: kevlanivedang28@gmail.com for any changes to this booking.');
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(1500);
console.log('Hotel notes updated.');

console.log('--- Report a delay on the hotel (new check-in 2h later) ---');
const hotelCard2 = page.locator('div', { hasText: 'TWA-DEMO-1' }).filter({ hasText: 'Report a delay' }).last();
await hotelCard2.getByText('Report a delay', { exact: true }).click();
await page.waitForTimeout(400);
const newTimeInput = hotelCard2.locator('input[type=datetime-local]').first();

const d = new Date();
d.setHours(d.getHours() + 26); // well past original 11pm check-in, > 30min disruptive and unambiguous
const pad = (n) => String(n).padStart(2, '0');
const newVal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
await newTimeInput.fill(newVal);
await Promise.all([
  page.waitForResponse((r) => r.url().includes('/report-disruption') && r.request().method() === 'POST'),
  hotelCard2.getByText('Report delay', { exact: true }).click(),
]);
await page.waitForTimeout(1500);
console.log('Hotel delay reported (new check-in:', newVal, ')');

await page.waitForTimeout(5000);
await page.reload({ waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(OUT, 'after_hotel_report.png'), fullPage: true });

const viewMessages = page.getByText('View messages', { exact: false });
if (await viewMessages.count() > 0) {
  await viewMessages.first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, 'view_messages_hotel.png'), fullPage: true });
}

await browser.close();
console.log('--- DONE ---');

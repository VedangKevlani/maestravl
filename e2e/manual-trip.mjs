// Manual smoke test: signup -> create trip -> add passenger -> add flight
// segment -> edit it -> confirm it shows on the dashboard.
//
// Requires a running server (dev or production build) at BASE_URL.
//   npm run build && npm run start   (recommended — dev's on-demand
//     compilation introduces timing flakiness unrelated to the app itself)
//   node e2e/manual-trip.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

const email = `smoketest+${Date.now()}@example.com`;

console.log('--- Signup ---');
await page.goto(`${BASE_URL}/signup`, { waitUntil: 'networkidle' });
await page.fill('#name', 'Smoke Test');
await page.fill('#email', email);
await page.fill('#password', 'password123');
await page.click('button[type=submit]');
await page.waitForURL('**/dashboard', { timeout: 40000 });

console.log('--- Create manual trip ---');
await page.click('text=+ New Trip');
await page.waitForURL('**/trips/new');
await page.fill('input[placeholder*="Trip name"]', 'Kingston to Punta Cana');
await page.click('text=Start trip');
await page.waitForURL(/\/trips\/(?!new)[a-z0-9]+$/i, { timeout: 40000 });
await page.waitForLoadState('networkidle');

console.log('--- Add passenger ---');
await page.click('text=+ Add passenger');
await page.fill('input[placeholder="Passenger name"]', 'Jane Doe');
await page.click('button:has-text("Add")');
await page.waitForTimeout(1000);

console.log('--- Add a flight segment ---');
await page.fill('input[placeholder="e.g. American Airlines"]', 'American Airlines');
await page.fill('input[placeholder="e.g. AA123"]', 'AA123');
await page.locator('label:has-text("Departure airport") input').first().fill('Kingston (KIN)');
await page.locator('label:has-text("Arrival airport") input').first().fill('Miami (MIA)');
await page.locator('label:has-text("Departure airport code") input').first().fill('KIN');
await page.locator('label:has-text("Arrival airport code") input').first().fill('MIA');
const depTimeInputs = await page.locator('input[type=datetime-local]').all();
await depTimeInputs[0].fill('2026-12-15T14:30');
await depTimeInputs[1].fill('2026-12-15T17:45');
const [resp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes('/segments') && r.request().method() === 'POST'),
  page.click('text=Add to timeline'),
]);
assert.equal(resp.status(), 201, 'segment creation should succeed');

console.log('--- Verify segment appears in the timeline ---');
await page.waitForTimeout(500);
const segmentText = await page.locator('text=American Airlines').first().textContent({ timeout: 8000 });
assert.match(segmentText, /American Airlines/);
await page.screenshot({ path: path.join(OUT, 'trip_detail.png'), fullPage: true });

console.log('--- Edit the segment ---');
await page.click('text=Edit');
await page.locator('label:has-text("Seat") input').first().fill('14A');
await page.click('button:has-text("Save")');
await page.waitForTimeout(1000);
assert.equal(await page.locator('text=Seat 14A').first().isVisible(), true, 'edited field should re-render without a manual page reload');

console.log('--- Dashboard shows the trip ---');
await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
assert.equal(await page.locator('text=Kingston to Punta Cana').first().isVisible(), true);
await page.screenshot({ path: path.join(OUT, 'dashboard.png'), fullPage: true });

await browser.close();
console.log('--- PASS ---');

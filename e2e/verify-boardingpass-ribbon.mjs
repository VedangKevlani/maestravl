// Verifies the new BoardingPass ribbon: report a delay via the Manage panel
// and confirm the recovery-run ribbon (status headline, "View messages")
// renders on the card without a manual reload.
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

console.log('--- Create trip + segment ---');
await page.click('text=+ New Trip');
await page.waitForURL('**/trips/new');
await page.fill('input[placeholder*="Trip name"]', 'Ribbon check');
await page.click('text=Start trip');
await page.waitForURL(/\/trips\/(?!new)[a-z0-9]+$/i, { timeout: 40000 });
await page.waitForLoadState('networkidle');

await page.fill('input[placeholder="e.g. American Airlines"]', 'American Airlines');
await page.fill('input[placeholder="e.g. AA123"]', 'AA123');
await page.locator('label:has-text("Departure airport") input').first().fill('Kingston (KIN)');
await page.locator('label:has-text("Arrival airport") input').first().fill('Miami (MIA)');
await page.locator('label:has-text("Departure airport code") input').first().fill('KIN');
await page.locator('label:has-text("Arrival airport code") input').first().fill('MIA');
const depTimeInputs = await page.locator('input[type=datetime-local]').all();
await depTimeInputs[0].fill('2026-12-15T14:30');
await depTimeInputs[1].fill('2026-12-15T17:45');
await Promise.all([
  page.waitForResponse((r) => r.url().includes('/segments') && r.request().method() === 'POST'),
  page.click('text=Add to timeline'),
]);
await page.waitForTimeout(1000);

console.log('--- Report a delay via Manage panel ---');
await page.click('text=Manage');
await page.waitForTimeout(300);
await page.click('text=Report a delay');
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, 'report_panel_open.png'), fullPage: true });
const reportTimeInput = page.locator('input[type=datetime-local]').first();
console.log('report time input value before fill:', await reportTimeInput.inputValue());
await reportTimeInput.fill('2026-12-15T18:30');
console.log('report time input value after fill:', await reportTimeInput.inputValue());
const reportDelayButton = page.getByRole('button', { name: 'Report delay', exact: true });
console.log('report delay button count:', await reportDelayButton.count());
const [resp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes('/report-disruption') && r.request().method() === 'POST', { timeout: 10000 }).catch((e) => { console.log('no response captured:', e.message); return null }),
  reportDelayButton.click(),
]);
console.log('report-disruption status:', resp ? resp.status() : 'none');
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, 'after_report_click.png'), fullPage: true });
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(OUT, 'ribbon_after_report.png'), fullPage: true });

console.log('--- Verify ribbon appeared ---');
const delayedPillVisible = await page.locator('text=Delayed').first().isVisible().catch(() => false);
console.log('DELAYED pill visible:', delayedPillVisible);
const viewMessagesVisible = await page.locator('text=View messages').first().isVisible().catch(() => false);
console.log('View messages control visible:', viewMessagesVisible);

await browser.close();
console.log('--- DONE ---');

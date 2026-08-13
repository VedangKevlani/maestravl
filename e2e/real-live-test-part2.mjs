// Part 2: the real live AviationStack check (already run on segment creation,
// see part 1) found both flights genuinely delayed today (17min / 21min) but
// under the app's 30min disruptive threshold, and the very first reading
// never triggers a disruption by design (nothing to compare against yet).
// So — matching the app's own documented manual-report path — report a
// bigger delay on flight 1 by hand to actually exercise the recovery
// pipeline end to end, and watch it cascade into the tight connection.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TRIP_URL = process.argv[2];
if (!TRIP_URL) { console.error('Usage: node real-live-test-part2.mjs <tripUrl>'); process.exit(1); }
const LOGIN_EMAIL = 'kevlanivedang28@gmail.com';
const LOGIN_PASSWORD = process.env.TEST_LOGIN_PASSWORD;
if (!LOGIN_PASSWORD) { console.error('Set TEST_LOGIN_PASSWORD env var before running.'); process.exit(1); }

function todayAt(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
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

console.log('--- Report a delay on flight 1 (AA1742): new departure 17:30 (2.5h late) ---');
const flight1Card = page.locator('text=AA1742').locator('xpath=ancestor::*[contains(@class,"glass-card") or self::div][1]');
// The segment cards aren't uniquely classed in a simple way; find the "Report a delay" button in the block containing AA1742.
const cardWithAA1742 = page.locator('div', { hasText: 'AA1742' }).filter({ hasText: 'Report a delay' }).last();
await cardWithAA1742.getByText('Report a delay', { exact: true }).click();
await page.waitForTimeout(400);
const newTimeInput = cardWithAA1742.locator('input[type=datetime-local]').first();
await newTimeInput.fill(todayAt('17:30'));
await Promise.all([
  page.waitForResponse((r) => r.url().includes('/report-disruption') && r.request().method() === 'POST'),
  cardWithAA1742.getByText('Report delay', { exact: true }).click(),
]);
await page.waitForTimeout(1500);
console.log('Delay reported.');

await page.screenshot({ path: path.join(OUT, 'after_report_delay.png'), fullPage: true });

console.log('--- Waiting for AgentRun to progress (polling banner) ---');
await page.waitForTimeout(4000);
await page.reload({ waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(OUT, 'after_reload_1.png'), fullPage: true });

await page.waitForTimeout(6000);
await page.reload({ waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(OUT, 'after_reload_2.png'), fullPage: true });

console.log('--- Opening View messages panel if present ---');
const viewMessages = page.getByText('View messages', { exact: false });
if (await viewMessages.count() > 0) {
  await viewMessages.first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, 'view_messages.png'), fullPage: true });
} else {
  console.log('No "View messages" link found yet.');
}

console.log('--- System health page ---');
await page.goto(`${BASE_URL}/system-health`, { waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(OUT, 'system_health.png'), fullPage: true });

await browser.close();
console.log('--- DONE ---');

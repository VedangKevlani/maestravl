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

console.log('--- Report one more delay on AA1742 (3 stale ACTION_REQUIRED runs already open on it) ---');
const flight1Card = page.locator('div', { hasText: 'AA1742' }).filter({ hasText: 'Report a delay' }).last();
await flight1Card.getByText('Report a delay', { exact: true }).click();
await page.waitForTimeout(400);
const pad = (n) => String(n).padStart(2, '0');
const d = new Date(); d.setHours(21, 30, 0, 0);
const val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
await flight1Card.locator('input[type=datetime-local]').first().fill(val);
await Promise.all([
  page.waitForResponse((r) => r.url().includes('/report-disruption') && r.request().method() === 'POST'),
  flight1Card.getByText('Report delay', { exact: true }).click(),
]);
await page.waitForTimeout(2000);
console.log('Delay reported.');

await page.reload({ waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(OUT, 'supersede_check2.png'), fullPage: true });

await browser.close();
console.log('--- DONE ---');

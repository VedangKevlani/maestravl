// Part 8: show the RESCHEDULING state in the browser — real replies, real
// interpretation, the "Confirm — update itinerary" step waiting on the
// passenger. Doesn't click confirm yet (that mutates real segment data).
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
await page.screenshot({ path: path.join(OUT, 'rescheduling_state.png'), fullPage: true });
await browser.close();

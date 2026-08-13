import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const LOGIN_EMAIL = 'realtest+1786591133438@example.com';
const LOGIN_PASSWORD = 'password123';
const TRIP_ID = 'cmsqy9na6001xwb7g46s0m2cv';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(120000);

await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
await page.fill('#email', LOGIN_EMAIL);
await page.fill('#password', LOGIN_PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL('**/dashboard', { timeout: 90000 });

console.log('--- Voice turn (extended timeout) ---');
const res = await page.request.post(`${BASE_URL}/api/trips/${TRIP_ID}/voice`, {
  data: { transcript: 'Is everything confirmed now for my trip to Montego Bay?', history: [], pendingAction: null },
  timeout: 90000,
});
const body = await res.json().catch(() => ({}));
console.log('status:', res.status());
console.log('reply:', body.reply ?? JSON.stringify(body));

await browser.close();

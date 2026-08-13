// Follow-up to real-delayed-flight-demo.mjs: logs back into the same test
// trip and actually clicks "Confirm — update itinerary" on the real
// RESCHEDULING run (a real human, the account owner, confirmed via a
// genuine email reply that this should proceed) — then checks the
// remaining untested features: the segment's departureTime actually
// rewritten (AgentActionType.UPDATE_ITINERARY), the Uber deep-link
// affordance once a segment is delayed, and one more voice-assistant turn
// now that the earlier run's Gemini free-tier quota may have reset.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const LOGIN_EMAIL = 'realtest+1786591133438@example.com';
const LOGIN_PASSWORD = 'password123';
const TRIP_ID = 'cmsqy9na6001xwb7g46s0m2cv';

const browser = await chromium.launch({ headless: false, slowMo: 60 });
const page = await browser.newPage({ viewport: { width: 1360, height: 960 } });
page.setDefaultTimeout(120000);
page.setDefaultNavigationTimeout(120000);

async function shot(name) {
  await page.screenshot({ path: path.join(OUT, `followup-${name}.png`), fullPage: true });
}

console.log('--- Login ---');
await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
await page.fill('#email', LOGIN_EMAIL);
await page.fill('#password', LOGIN_PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL('**/dashboard', { timeout: 90000 });

console.log('--- Go to trip ---');
await page.goto(`${BASE_URL}/trips/${TRIP_ID}`, { waitUntil: 'networkidle' });
await shot('01-before-confirm');

console.log('--- Click "Confirm — update itinerary" on the real RESCHEDULING run ---');
const [confirmResp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes('/confirm-reschedule') && r.request().method() === 'POST'),
  page.click('button:has-text("Confirm — update itinerary")'),
]);
console.log('confirm-reschedule status:', confirmResp.status());
await page.waitForTimeout(1500);
await page.reload({ waitUntil: 'networkidle' });
await shot('02-after-confirm');

console.log('--- Test "Heard back?" resolve flow on the hotel (still ACTION_REQUIRED/WAITING) ---');
const hotelCard = page.locator('div.glass-card', { has: page.locator('text=Hyatt Zilara Rose Hall') }).first();
const heardBackBtn = hotelCard.locator('text=/Heard back\\?/i');
if (await heardBackBtn.isVisible().catch(() => false)) {
  await heardBackBtn.click();
  await page.waitForTimeout(300);
  await hotelCard.locator('textarea').fill('Front desk confirmed the delay is noted, no changes needed to the reservation.');
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/resolve') && r.request().method() === 'POST'),
    hotelCard.locator('button:has-text("Mark as resolved")').click(),
  ]);
  await page.waitForTimeout(1000);
  await page.reload({ waitUntil: 'networkidle' });
  await shot('03-after-resolve-hotel');
} else {
  console.log('No "Heard back?" button visible on the hotel card right now.');
}

console.log('--- Check Uber deep-link affordance now that AA655 has an active run ---');
const aa655Card = page.locator('div.glass-card', { has: page.locator('text=AA655') }).first();
await aa655Card.locator('text=Manage').click();
await page.waitForTimeout(300);
const uberVisible = await aa655Card.locator('text=/Get an Uber there/i').isVisible().catch(() => false);
console.log('Uber link visible:', uberVisible);
await shot('04-aa655-manage-open');

console.log('--- One more voice turn (quota may have reset) ---');
const res = await page.request.post(`${BASE_URL}/api/trips/${TRIP_ID}/voice`, {
  data: { transcript: 'Is everything confirmed now for my trip to Montego Bay?', history: [], pendingAction: null },
});
const body = await res.json().catch(() => ({}));
console.log('voice reply:', body.reply ?? JSON.stringify(body));

await browser.close();
console.log('--- DONE ---');

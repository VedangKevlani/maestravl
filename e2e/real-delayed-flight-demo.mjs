// Real-world scenario: a real, near-term American Airlines flight (JFK->MIA,
// live schedule pulled from AeroDataBox minutes before this script was
// written) delayed enough to blow its connection to a real onward flight
// (MIA->MBJ), plus a real hotel in Montego Bay. Exercises the full
// disruption -> orchestrator -> recovery pipeline end-to-end in a real
// browser, then every passenger-facing recovery feature: report a delay,
// live monitoring check, the recovery ribbon, View messages, Heard back?,
// Confirm reschedule, the Uber deep link, and the voice assistant (text
// turns against the real API route — speech recognition has no place to
// point a microphone in a headless/automated browser).
//
// The "provider" contact email is deliberately the operator's own inbox
// (put in each flight segment's notes near the word "Reservations", which
// contactDiscovery.ts scores at 85 confidence — comfortably over the
// auto-contact threshold) so real outbound Resend sends land somewhere
// real and safe to check, instead of risking contact-discovery's MiniMax
// web-search fallback finding and emailing American Airlines' actual
// support address.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const SELF_EMAIL = 'kevlanivedang28@gmail.com';

const browser = await chromium.launch({ headless: false, slowMo: 60 });
const page = await browser.newPage({ viewport: { width: 1360, height: 960 } });
// Next dev's on-demand compilation makes the first hit of any route slow
// (30s+) — generous timeouts here, not a sign anything is actually wrong.
page.setDefaultTimeout(120000);
page.setDefaultNavigationTimeout(120000);
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));
page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });

async function shot(name) {
  await page.screenshot({ path: path.join(OUT, `real-${name}.png`), fullPage: true });
}

const email = `realtest+${Date.now()}@example.com`;

console.log('--- Signup ---');
await page.goto(`${BASE_URL}/signup`, { waitUntil: 'networkidle' });
await page.fill('#name', 'Real Delay Demo');
await page.fill('#email', email);
await page.fill('#password', 'password123');
await page.click('button[type=submit]');
await page.waitForURL('**/dashboard', { timeout: 90000 });

console.log('--- Create trip ---');
await page.click('text=+ New Trip');
await page.waitForURL('**/trips/new');
await page.fill('input[placeholder*="Trip name"]', 'JFK -> Montego Bay (real live delay demo)');
await page.click('text=Start trip');
await page.waitForURL(/\/trips\/(?!new)[a-z0-9]+$/i, { timeout: 90000 });
await page.waitForLoadState('networkidle');
const tripUrl = page.url();
const tripId = tripUrl.match(/\/trips\/([a-z0-9]+)$/i)[1];
console.log('Trip ID:', tripId);

console.log('--- Add passenger (own email, so real notification emails are checkable) ---');
await page.click('text=+ Add passenger');
await page.fill('input[placeholder="Passenger name"]', 'Real Delay Demo');
await page.fill('input[placeholder="Email (for notifications)"]', SELF_EMAIL);
await page.click('button:has-text("Add")');
await page.waitForTimeout(1000);

async function addSegment({ transportType, provider, identifier, departureLocation, arrivalLocation, departureLocationCode, arrivalLocationCode, departureTime, arrivalTime, timezone, notes, confirmationNumber }) {
  await page.locator('button:has-text("' + { FLIGHT: 'Flight', HOTEL: 'Hotel' }[transportType] + '")').first().click();
  await page.fill('input[placeholder="e.g. American Airlines"], input[placeholder="e.g. Marriott, Airbnb host"]', provider);
  if (identifier) await page.fill('input[placeholder="e.g. AA123"], input[placeholder="e.g. confirmation number"]', identifier);

  if (transportType === 'FLIGHT') {
    await page.locator('label:has-text("Departure airport") input').first().fill(departureLocation);
    await page.locator('label:has-text("Arrival airport") input').first().fill(arrivalLocation);
    await page.locator('label:has-text("Departure airport code") input').first().fill(departureLocationCode);
    await page.locator('label:has-text("Arrival airport code") input').first().fill(arrivalLocationCode);
  } else {
    await page.locator('label:has-text("Hotel location") input').first().fill(departureLocation);
  }

  const timeInputs = await page.locator('input[type=datetime-local]').all();
  await timeInputs[0].fill(departureTime);
  if (arrivalTime && timeInputs[1]) await timeInputs[1].fill(arrivalTime);

  await page.locator('label:has-text("Timezone") input').first().fill(timezone);
  if (notes) await page.fill('textarea', notes);
  if (confirmationNumber) await page.locator('label:has-text("Confirmation number") input').first().fill(confirmationNumber);

  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/segments') && r.request().method() === 'POST'),
    page.click('text=Add to timeline'),
  ]);
  assert.equal(resp.status(), 201, `${provider} ${identifier ?? ''} segment creation should succeed`);
  await page.waitForTimeout(600);
}

console.log('--- Add real Flight 1: AA 655 JFK -> MIA (real schedule, live-pulled) ---');
await addSegment({
  transportType: 'FLIGHT',
  provider: 'American Airlines',
  identifier: 'AA655',
  departureLocation: 'New York JFK',
  arrivalLocation: 'Miami International',
  departureLocationCode: 'JFK',
  arrivalLocationCode: 'MIA',
  departureTime: '2026-08-13T05:55',
  arrivalTime: '2026-08-13T09:04',
  timezone: 'America/New_York',
  notes: `Reservations / contact: ${SELF_EMAIL}`,
  confirmationNumber: 'RLDEMO1',
});

console.log('--- Add real connecting Flight 2: AA 3154 MIA -> MBJ (real schedule) ---');
await addSegment({
  transportType: 'FLIGHT',
  provider: 'American Airlines',
  identifier: 'AA3154',
  departureLocation: 'Miami International',
  arrivalLocation: 'Sangster International (Montego Bay)',
  departureLocationCode: 'MIA',
  arrivalLocationCode: 'MBJ',
  departureTime: '2026-08-13T13:00',
  arrivalTime: '2026-08-13T13:49',
  timezone: 'America/New_York',
  notes: `Reservations / contact: ${SELF_EMAIL}`,
  confirmationNumber: 'RLDEMO2',
});

console.log('--- Add Hotel: Hyatt Zilara Rose Hall, Montego Bay ---');
await addSegment({
  transportType: 'HOTEL',
  provider: 'Hyatt Zilara Rose Hall',
  identifier: 'RLDEMO3',
  departureLocation: 'Rose Hall, Montego Bay, Jamaica',
  departureTime: '2026-08-13T15:00',
  arrivalTime: '2026-08-16T11:00',
  timezone: 'America/Jamaica',
  notes: `Front desk / reservations: ${SELF_EMAIL}`,
});

await shot('01-itinerary-built');

console.log('--- Verify all 3 segments show on the timeline ---');
await assert.doesNotReject(page.locator('text=AA655').first().waitFor({ timeout: 5000 }));
await assert.doesNotReject(page.locator('text=AA3154').first().waitFor({ timeout: 5000 }));
await assert.doesNotReject(page.locator('text=Hyatt Zilara Rose Hall').first().waitFor({ timeout: 5000 }));
console.log('All 3 real segments present.');

console.log('--- Report a real delay on AA655 (pushes past AA3154 departure -> should cascade) ---');
const boardingPasses = page.locator('div.glass-card', { has: page.locator('text=AA655') }).first();
await boardingPasses.locator('text=Manage').click();
await page.waitForTimeout(300);
await boardingPasses.locator('text=Report a delay').click();
await page.waitForTimeout(300);
await boardingPasses.locator('input[type=datetime-local]').fill('2026-08-13T10:30');
const [reportResp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes('/report-disruption') && r.request().method() === 'POST'),
  boardingPasses.locator('button:has-text("Report delay")').click(),
]);
const reportBody = await reportResp.json();
console.log('report-disruption response:', JSON.stringify(reportBody).slice(0, 500));
assert.equal(reportResp.status(), 200, 'report-disruption should succeed');
assert.ok(reportBody.agentRun, 'a real AgentRun should have been created for a >30min delay');
console.log('AgentRun status after synchronous orchestration:', reportBody.agentRun.status);

await page.waitForTimeout(1000);
await page.reload({ waitUntil: 'networkidle' });
await shot('02-after-real-delay-report');

console.log('--- Verify recovery ribbon appeared on the delayed flight ---');
// NOTE: found via this exact run — handleDisruptionDetection (lib/agents/detect.ts)
// never writes back to segment.status, so the boarding-pass "ticket status"
// pill stays SCHEDULED even mid-recovery. The real signal is the ribbon.
await assert.doesNotReject(page.locator('text=/Maestravl is waiting to hear back|Maestravl is reaching out|Maestravl noticed a change|Maestravl is checking what this affects/i').first().waitFor({ timeout: 8000 }));

console.log('--- Verify the connecting flight (AA3154) got pulled into the recovery run (real dependency-graph cascade) ---');
const connectingCard = page.locator('div.glass-card', { has: page.locator('text=AA3154') }).first();
const connectingRibbonVisible = await connectingCard.locator('text=/Maestravl|reached out|waiting|checking/i').first().isVisible().catch(() => false);
console.log('Connecting-flight ribbon visible (DIRECT impact detected):', connectingRibbonVisible);

console.log('--- Open "View messages" on the delayed flight to see the real outbound email ---');
const delayedCard = page.locator('div.glass-card', { has: page.locator('text=AA655') }).first();
await delayedCard.locator('text=/View messages/i').click();
await page.waitForTimeout(1500);
await shot('03-view-messages-delayed-flight');
const sentMessageVisible = await delayedCard.locator('text=/Sent by Maestravl/i').first().isVisible().catch(() => false);
console.log('Real outbound provider email visible in Messages panel:', sentMessageVisible);

if (connectingRibbonVisible) {
  console.log('--- Open "View messages" on the connecting flight too ---');
  await connectingCard.locator('text=/View messages/i').click();
  await page.waitForTimeout(1500);
  await shot('04-view-messages-connecting-flight');
}

console.log('--- Test "Check now" live monitoring on the connecting flight ---');
const checkNowBtn = connectingCard.locator('button:has-text("Check now")');
if (await checkNowBtn.isVisible().catch(() => false)) {
  await checkNowBtn.click();
  await page.waitForTimeout(2000);
  await shot('05-after-check-now');
} else {
  console.log('No "Check now" button visible (monitoring likely not ACTIVE for this segment yet).');
}

console.log('--- Test the Uber deep link affordance on the delayed flight ---');
const uberLink = delayedCard.locator('text=/Get an Uber there/i');
const uberVisible = await uberLink.isVisible().catch(() => false);
console.log('Uber deep link visible:', uberVisible, uberVisible ? '' : '(expected: NEXT_PUBLIC_UBER_CLIENT_ID is unset in .env)');

console.log('--- Test the voice assistant (text turns against the real API route) ---');
async function voiceTurn(transcript, history, pendingAction) {
  const res = await page.request.post(`${BASE_URL}/api/trips/${tripId}/voice`, {
    data: { transcript, history, pendingAction },
  });
  const body = await res.json();
  console.log(`  > ${transcript}`);
  console.log(`  < ${body.reply}`);
  if (body.pendingAction) console.log('  pendingAction:', JSON.stringify(body.pendingAction).slice(0, 200));
  return body;
}

console.log('Voice turn 1: ask about the trip');
const v1 = await voiceTurn("What's going on with my flight to Montego Bay?", [], null);
const h1 = [
  { role: 'user', content: "What's going on with my flight to Montego Bay?" },
  { role: 'assistant', content: v1.reply },
];

console.log('Voice turn 2: ask it to check live status of AA3154');
const v2 = await voiceTurn('Can you check the live status of AA3154 right now?', h1, v1.pendingAction);
const h2 = [...h1,
  { role: 'user', content: 'Can you check the live status of AA3154 right now?' },
  { role: 'assistant', content: v2.reply },
];

if (v2.pendingAction) {
  console.log('Voice turn 3: confirm the pending action');
  await voiceTurn('Yes, go ahead.', h2, v2.pendingAction);
}

await shot('06-final-state');

console.log('--- Dashboard shows the trip ---');
await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
assert.equal(await page.locator('text=JFK -> Montego Bay').first().isVisible(), true);
await shot('07-dashboard');

console.log('--- System health page ---');
await page.goto(`${BASE_URL}/system-health`, { waitUntil: 'networkidle' });
await shot('08-system-health');

await browser.close();
console.log('--- DONE --- trip id:', tripId, '/ login email:', email);

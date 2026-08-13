// Live verification of voice mutation parity: real two-turn propose->confirm
// exchange against the actual deployed API route (no microphone needed —
// speech-to-text is client-side, this route only ever takes plain text).
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TRIP_ID = process.argv[2];
const LOGIN_EMAIL = 'kevlanivedang28@gmail.com';
const LOGIN_PASSWORD = process.env.TEST_LOGIN_PASSWORD;

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
await page.fill('#email', LOGIN_EMAIL);
await page.fill('#password', LOGIN_PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL('**/dashboard', { timeout: 40000 });

async function turn(transcript, history, pendingAction) {
  const res = await page.request.post(`${BASE_URL}/api/trips/${TRIP_ID}/voice`, {
    data: { transcript, history, pendingAction },
  });
  const body = await res.json();
  console.log(`> ${transcript}`);
  console.log(`< ${body.reply}`);
  console.log('  pendingAction:', body.pendingAction ? JSON.stringify(body.pendingAction).slice(0, 200) : null);
  console.log('');
  return body;
}

console.log('--- Turn 1: ask to check live status of the Amtrak train ---');
const t1 = await turn('Can you check the live status of the Amtrak train to Boston right now?', [], null);
const history1 = [
  { role: 'user', content: 'Can you check the live status of the Amtrak train to Boston right now?' },
  { role: 'assistant', content: t1.reply },
];

console.log('--- Turn 2: confirm ---');
const t2 = await turn('Yes, go ahead.', history1, t1.pendingAction);

await browser.close();

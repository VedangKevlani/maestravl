// Exercises the real upload -> OCR -> rule-based parsing -> confidence
// scoring pipeline against a synthetic itinerary image. Regenerate the
// fixture first if it's missing: node e2e/fixtures/make-test-itinerary.mjs
//
// Requires a running server: npm run build && npm run start
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'test-itinerary.png');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

if (!fs.existsSync(FIXTURE)) {
  console.error(`Missing fixture: ${FIXTURE}\nRun: node e2e/fixtures/make-test-itinerary.mjs`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

const email = `upload+${Date.now()}@example.com`;

await page.goto(`${BASE_URL}/signup`, { waitUntil: 'networkidle' });
await page.fill('#name', 'Upload Test');
await page.fill('#email', email);
await page.fill('#password', 'password123');
await page.click('button[type=submit]');
await page.waitForURL('**/dashboard', { timeout: 40000 });

await page.goto(`${BASE_URL}/trips/new`, { waitUntil: 'networkidle' });

const [fileChooser] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.click('text=Drop a PDF'),
]);
await fileChooser.setFiles(FIXTURE);

console.log('Uploading and running OCR + extraction (can take up to a minute)...');
const resp = await page.waitForResponse((r) => r.url().includes('/api/upload'), { timeout: 90000 });
assert.equal(resp.status(), 201, 'upload should succeed');
const body = await resp.json();

const seg = body.trip.segments[0];
assert.equal(body.trip.segments.length, 1, 'a gate number ("B12") must not be mistaken for a second flight');
assert.equal(seg.identifier, 'AA123');
assert.equal(seg.provider, 'American Airlines');
assert.equal(seg.confirmationNumber, 'XJ7K2P');
assert.equal(seg.departureLocationCode, 'KIN');
assert.equal(seg.arrivalLocationCode, 'MIA');
assert.equal(seg.seat, '14A');
assert.equal(seg.departureGate, 'B12');
assert.equal(seg.price, 349);
assert.equal(seg.currency, 'USD');
assert.ok(body.trip.passengers.some((p) => p.name === 'John Smith'), 'should extract passenger name from PNR-style "SMITH/JOHN MR"');
assert.equal(body.extraction.method, 'ocr');
assert.ok(body.extraction.overallConfidence > 60, 'a clean synthetic itinerary should extract with reasonably high confidence');

console.log('Extraction result:', JSON.stringify(body.extraction, null, 2));
await browser.close();
console.log('--- PASS ---');

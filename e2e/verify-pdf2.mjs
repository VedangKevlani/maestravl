import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TRIP_URL = process.argv[2];
const LOGIN_EMAIL = 'kevlanivedang28@gmail.com';
const LOGIN_PASSWORD = process.env.TEST_LOGIN_PASSWORD;

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });

await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
await page.fill('#email', LOGIN_EMAIL);
await page.fill('#password', LOGIN_PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL('**/dashboard', { timeout: 40000 });

const tripId = TRIP_URL.split('/trips/')[1];
const pdfUrl = `${BASE_URL}/api/trips/${tripId}/activity/pdf`;
console.log('Fetching', pdfUrl, 'with the logged-in session...');

const response = await page.request.get(pdfUrl);
console.log('status:', response.status());
console.log('content-type:', response.headers()['content-type']);
console.log('content-disposition:', response.headers()['content-disposition']);

const body = await response.body();
fs.writeFileSync(path.join(OUT, 'real_activity_log.pdf'), body);
console.log('Saved', body.length, 'bytes');

await browser.close();

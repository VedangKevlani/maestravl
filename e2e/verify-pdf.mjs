import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TRIP_URL = process.argv[2];
const LOGIN_EMAIL = 'kevlanivedang28@gmail.com';
const LOGIN_PASSWORD = process.env.TEST_LOGIN_PASSWORD;

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1400, height: 1400 }, acceptDownloads: true });

await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
await page.fill('#email', LOGIN_EMAIL);
await page.fill('#password', LOGIN_PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL('**/dashboard', { timeout: 40000 });
await page.goto(TRIP_URL, { waitUntil: 'networkidle' });

const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.click('text=Download activity log (PDF)'),
]);
const savePath = path.join(OUT, 'real_activity_log.pdf');
await download.saveAs(savePath);
console.log('Downloaded to', savePath);

await browser.close();

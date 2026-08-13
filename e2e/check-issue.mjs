import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
const consoleMsgs = [];
page.on('console', (msg) => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => consoleMsgs.push(`[pageerror] ${err.message}`));

await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
await page.fill('#email', 'kevlanivedang28@gmail.com');
await page.fill('#password', process.env.TEST_LOGIN_PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL('**/dashboard', { timeout: 40000 });
await page.goto('http://localhost:3000/trips/cmsqdu2zt0001qmmecs5cg5p9', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

console.log('--- console/page messages ---');
console.log(consoleMsgs.join('\n'));

const issueBadge = page.getByText(/Issue/i).first();
if (await issueBadge.count() > 0) {
  await issueBadge.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'e2e/output/dev_overlay_issue.png', fullPage: false });
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('--- overlay text (truncated) ---');
  console.log(bodyText.slice(0, 3000));
} else {
  console.log('No issue badge found this time.');
}
await browser.close();

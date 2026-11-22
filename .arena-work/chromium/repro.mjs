// Local reproduction harness: walk the v2 placement quiz like a real learner.
import { chromium } from '/home/user/fluency-app/node_modules/@playwright/test/index.mjs';


const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const signedIn = process.env.SIGNED_IN === 'true';

const executablePath = '/tmp/chr112/chromium';
const browser = await chromium.launch({
  executablePath,
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chr112/lib' },
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const apiRequests = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.url().includes('/api/') || r.url().includes('supabase.co')) apiRequests.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 140)}`); });

try {
  if (signedIn) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/Email address/i).fill(process.env.E2E_USER_EMAIL);
    await page.getByLabel(/^Password/i).fill(process.env.E2E_USER_PASSWORD);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await page.waitForURL(/\/(dashboard|labs|teacher|onboarding)/, { timeout: 30000 });
    console.log('Signed in ->', page.url());
  }

  const res = await page.goto(`${BASE}/onboarding/placement`, { waitUntil: 'domcontentloaded' });
  console.log('placement page status:', res?.status());

  const questions = await page.evaluate(() => {
    const html = document.documentElement.innerHTML;
    const m = html.match(/(\d+)-questions and a writing task/);
    return m ? Number(m[1]) : null;
  });
  console.log('banner question count:', questions);

  for (let i = 1; i <= 24; i++) {
    await page.getByRole('heading', { name: `Question ${i} of 24` }).waitFor({ timeout: 15000 });
    const buttons = page.locator('button', { hasText: /./ });
    // choose the first option button: options are the first 4 buttons in the question block
    const optionLocator = page.locator('main .space-y-2\\.5 > button');
    const optionCount = await optionLocator.count();
    await optionLocator.nth(0).click();
    const next = page.getByRole('button', { name: i === 24 ? /Continue to Writing Sample/ : 'Next Question' });
    const disabled = await next.isDisabled();
    console.log(`Q${i}: options=${optionCount} nextDisabled=${disabled}`);
    if (disabled) {
      const alert = await page.getByRole('alert').allTextContents();
      console.log('  alerts:', JSON.stringify(alert));
      console.log('  reading passage count:', await page.locator('section[aria-label^="Reading"]').count());
    }
    await next.click();
  }

  const writingVisible = await page.getByRole('heading', { name: /Write a short text/ }).isVisible().catch(() => false);
  console.log('WRITING STEP VISIBLE:', writingVisible);
  await page.waitForTimeout(1500);
  console.log('h1s:', JSON.stringify(await page.locator('h1').allTextContents()));
} catch (error) {
  console.log('HARNESS ERROR:', error.message.split('\n')[0]);
  console.log('h1s:', JSON.stringify(await page.locator('h1').allTextContents().catch(() => [])));
} finally {
  console.log('--- console errors ---');
  console.log(consoleErrors.join('\n') || '(none)');
  console.log('--- page errors ---');
  console.log(pageErrors.join('\n') || '(none)');
  console.log('--- failed requests ---');
  console.log(failedRequests.join('\n') || '(none)');
  console.log('--- api/supabase responses (last 20) ---');
  console.log(apiRequests.slice(-20).join('\n') || '(none)');
  await browser.close();
}

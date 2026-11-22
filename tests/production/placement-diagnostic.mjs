// Diagnostic: answer all 24 v2 placement questions on production, signed in,
// and report exactly what happens when "Continue to Writing Sample →" is clicked.
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';

const BASE = process.env.PROD_BASE || 'https://fluency-app-nine.vercel.app';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = svc ? createClient(url, svc, { auth: { persistSession: false } }) : null;
const report = {};

const browser = await chromium.launch();
let user = null;

async function walk(page, label) {
  const consoleErrors = [];
  const pageErrors = [];
  const failed = [];
  const badResponses = [];
  const navigations = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(`${e.name}: ${e.message}`));
  page.on('requestfailed', (r) => failed.push(`${r.method()} ${r.url().slice(0, 90)} :: ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 90)}`); });
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations.push(f.url().slice(0, 90)); });

  const response = await page.goto(`${BASE}/onboarding/placement`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  report[`${label}_status`] = response?.status();
  await page.getByRole('heading', { name: /Question 1 of \d+/ }).waitFor({ timeout: 30000 });
  report[`${label}_h1_initial`] = JSON.stringify(await page.locator('h1').allTextContents());

  const steps = [];
  for (let i = 1; i <= 24; i++) {
    await page.getByRole('heading', { name: `Question ${i} of 24` }).waitFor({ timeout: 20000 });
    const reading = await page.locator('section[aria-label^="Reading"]').count();
    const alert = await page.getByRole('alert').allTextContents();
    const options = page.locator('main .space-y-2\\.5 > button');
    const optionCount = await options.count();
    await options.first().click();
    const next = page.getByRole('button', { name: i === 24 ? /Continue to Writing Sample/ : 'Next Question' });
    const disabled = await next.isDisabled();
    steps.push(`Q${i}[o${optionCount},r${reading}${disabled ? ',DISABLED' : ''}${alert.length ? `,alert=${alert.join('|').slice(0, 60)}` : ''}]`);
    if (disabled) break;
    await next.click();
    if (i === 24) {
      const appeared = await page.getByRole('heading', { name: /Write a short text/ })
        .waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
      report[`${label}_writing_visible`] = appeared;
      report[`${label}_h1_after`] = JSON.stringify(await page.locator('h1').allTextContents());
      report[`${label}_body_after`] = (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 300);
      report[`${label}_url_after`] = page.url();
      if (appeared) {
        const skip = page.getByRole('button', { name: 'Skip sample' });
        const scoreResponse = page.waitForResponse((r) => r.url().includes('/api/placement/score'), { timeout: 30000 }).catch(() => null);
        await skip.click();
        const scored = await scoreResponse;
        report[`${label}_score_status`] = scored ? scored.status() : 'no response';
        report[`${label}_score_body`] = scored ? (await scored.text()).slice(0, 200) : '';
        const done = await page.getByText(/Placement Check Complete|Suggested Band/).first()
          .waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
        report[`${label}_done_visible`] = done;
      }
    }
  }
  report[`${label}_steps`] = steps.join(' ');
  report[`${label}_console`] = consoleErrors.slice(0, 6).join(' || ') || 'none';
  report[`${label}_pageerrors`] = pageErrors.slice(0, 6).join(' || ') || 'none';
  report[`${label}_failed`] = failed.slice(0, 6).join(' || ') || 'none';
  report[`${label}_bad`] = badResponses.slice(0, 6).join(' || ') || 'none';
  report[`${label}_navs`] = navigations.join(' || ');
}

try {
  if (admin) {
    user = await createTestUser(admin, 'placement-prod-test');
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByLabel(/Email address/i).fill(user.email);
    await page.getByLabel(/^Password/i).fill(user.password);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await page.waitForURL(/\/(dashboard|labs|teacher|onboarding)/, { timeout: 60000 });
    report.landing = page.url();
    await walk(page, 'signedin');
    await context.close();
  } else {
    report.signedin = 'skipped: no service role key';
  }
} catch (error) {
  report.error = error.message.slice(0, 400);
} finally {
  if (user && admin) await deleteTestUser(admin, user.id).catch((e) => { report.cleanup_error = e.message; });
  await browser.close();
  console.log(`::warning::RESULT ${JSON.stringify(report)}`);
}

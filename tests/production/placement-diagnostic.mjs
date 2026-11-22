// Diagnostic: answer all 24 v2 placement questions on production and record
// exactly what happens when "Continue to Writing Sample →" is clicked.
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.PROD_BASE || 'https://fluency-app-nine.vercel.app';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = svc ? createClient(url, svc, { auth: { persistSession: false } }) : null;

const report = {};
function note(label, value) {
  report[label] = String(value);
  console.log(`${label}=${String(value).slice(0, 400)}`);
}

const browser = await chromium.launch();
let user = null;

async function walk(page, label) {
  const consoleErrors = [];
  const pageErrors = [];
  const failed = [];
  const badResponses = [];
  const navigations = [];
  const docs = [];

  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(`${e.name}: ${e.message}`));
  page.on('requestfailed', (r) => failed.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) badResponses.push(`${r.status()} ${r.request().method()} ${r.url()}`);
    if (r.request().resourceType() === 'document') docs.push(`${r.status()} ${r.url()}`);
  });
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });

  const response = await page.goto(`${BASE}/onboarding/placement`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  note(`${label}_status`, response?.status());
  await page.getByRole('heading', { name: /Question 1 of \d+/ }).waitFor({ timeout: 30000 });
  const total = await page.getByRole('heading', { name: /Question 1 of \d+/ }).innerText();
  note(`${label}_heading`, total);
  const passageCount = await page.locator('section[aria-label^="Reading"]').count();

  const steps = [];
  for (let i = 1; i <= 24; i++) {
    await page.getByRole('heading', { name: `Question ${i} of 24` }).waitFor({ timeout: 20000 });
    const question = await page.locator('main > div > div > p.text-sm').first().innerText().catch(() => '(unknown)');
    const reading = await page.locator('section[aria-label^="Reading"]').count();
    const options = page.locator('main .space-y-2\\.5 > button');
    const optionCount = await options.count();
    await options.first().click();
    const next = page.getByRole('button', { name: i === 24 ? /Continue to Writing Sample/ : 'Next Question' });
    const disabled = await next.isDisabled();
    const alerts = await page.getByRole('alert').allTextContents();
    steps.push(`Q${i}{opts:${optionCount},reading:${reading},disabled:${disabled}${alerts.length ? `,alert:${alerts.join('|')}` : ''}}`);
    if (disabled) {
      note(`${label}_disabled_q${i}`, `question="${question.slice(0, 80)}" alerts=${alerts.join('|')}`);
      break;
    }
    const before = await page.locator('h1').allTextContents();
    await next.click();
    if (i === 24) {
      const writingAppeared = await page.getByRole('heading', { name: /Write a short text/ })
        .waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
      note(`${label}_writing_visible`, writingAppeared);
      note(`${label}_after_continue_h1`, JSON.stringify(await page.locator('h1').allTextContents()));
      note(`${label}_after_continue_body`, (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 400));
      note(`${label}_writing_buttons`, JSON.stringify(
        await page.locator('main button').allTextContents().then((t) => t.map((x) => x.trim()).filter(Boolean)),
      ));
      await page.waitForTimeout(2000);
      note(`${label}_url_after_wait`, page.url());
    } else {
      const after = await page.locator('h1').allTextContents();
      if (JSON.stringify(before) === JSON.stringify(after)) note(`${label}_stuck_at_q${i}`, `${JSON.stringify(before)}`);
    }
  }

  note(`${label}_reads`, `first_passage=${passageCount}`);
  note(`${label}_steps`, steps.join(' '));
  note(`${label}_console_errors`, consoleErrors.slice(0, 8).join(' || ') || 'none');
  note(`${label}_page_errors`, pageErrors.slice(0, 8).join(' || ') || 'none');
  note(`${label}_failed_requests`, failed.slice(0, 8).join(' || ') || 'none');
  note(`${label}_bad_responses`, badResponses.slice(0, 8).join(' || ') || 'none');
  note(`${label}_navigations`, navigations.join(' || '));
  note(`${label}_documents`, docs.join(' || '));
}

try {
  const anonContext = await browser.newContext();
  await walk(await anonContext.newPage(), 'signedout');
  await anonContext.close();

  if (admin) {
    user = await createTestUser(admin, 'placement-prod-test');
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByLabel(/Email address/i).fill(user.email);
    await page.getByLabel(/^Password/i).fill(user.password);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await page.waitForURL(/\/(dashboard|labs|teacher|onboarding)/, { timeout: 60000 });
    note('signedin_landing', page.url());
    await walk(page, 'signedin');
    await context.close();
  } else {
    note('signedin', 'skipped: no service role key');
  }
} catch (error) {
  note('diagnostic_error', error.message);
} finally {
  if (user && admin) await deleteTestUser(admin, user.id).catch((e) => note('cleanup_error', e.message));
  await browser.close();
  mkdirSync('diagnostic-output', { recursive: true });
  writeFileSync('diagnostic-output/placement.json', JSON.stringify(report, null, 2));
  console.log('WROTE diagnostic-output/placement.json');
}

#!/usr/bin/env node
/**
 * Production check for the placement "Continue to Writing Sample →" freeze.
 *
 * Answers all 24 v2 questions on the live site, signed out and signed in, then
 * requires the writing step. Every console error, page error and failed request
 * is reported, and the small-phone layout is checked for the report button
 * covering the Continue button.
 *
 * Run from the workflow_dispatch input `production_placement_test`, or locally:
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     node tests/production/placement.mjs
 */
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';
import assert from 'node:assert/strict';

const BASE = process.env.PROD_BASE || 'https://fluency-app-nine.vercel.app';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;

function announce(message) {
  console.log(`::warning::${message.replace(/[\r\n]+/g, ' ').slice(0, 900)}`);
}

function watch(page, label) {
  const problems = [];
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => problems.push(`page: ${error.name}: ${error.message}`));
  page.on('requestfailed', (request) => problems.push(`request: ${request.method()} ${request.url()} :: ${request.failure()?.errorText}`));
  return () => {
    const relevant = problems.filter((entry) => !/favicon|manifest|ServiceWorker/i.test(entry));
    announce(`${label}_problems=${relevant.slice(0, 5).join(' || ') || 'none'}`);
    assert.deepEqual(relevant, [], `${label} produced console errors, page errors or failed requests`);
  };
}

async function walk(page, label, viewport) {
  const finish = watch(page, label);
  await page.setViewportSize(viewport);
  const response = await page.goto(`${BASE}/onboarding/placement`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  assert.equal(response?.status(), 200, `${label}: placement page did not return 200`);

  await page.getByRole('heading', { name: /Question 1 of \d+/ }).waitFor({ timeout: 30_000 });
  const bannerText = await page.getByText(/\d+-questions and a writing task/).evaluate((element) => element.textContent ?? '');
  const total = Number(bannerText.match(/(\d+)-questions/)?.[1] ?? 0);
  assert.ok(total >= 24, `${label}: expected 24 v2 questions, found ${total}`);
  announce(`${label}_questions=${total}`);

  for (let question = 1; question <= total; question++) {
    await page.getByRole('heading', { name: `Question ${question} of ${total}` }).waitFor({ timeout: 20_000 });
    const continueButton = page.getByRole('button', { name: question === total ? /Continue to Writing Sample/ : 'Next Question' });
    assert.equal(await continueButton.isDisabled(), true, `${label}: Q${question} Continue button was enabled before an answer`);
    assert.equal(await page.getByText('The reading passage for this question is unavailable', { exact: false }).count(), 0,
      `${label}: Q${question} could not resolve its reading passage`);

    await page.locator('main .space-y-2\\.5 > button').first().click();
    await continueButton.click({ timeout: 15_000 });
  }

  await page.getByRole('heading', { name: /Write a short text/ }).waitFor({ timeout: 20_000 });
  announce(`${label}_writing_step=visible`);
  finish();
}

/** On a small phone a fixed report pill used to cover the last Continue button. */
async function checkSmallPhoneLayout(page) {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`${BASE}/onboarding/placement`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const bannerText = await page.getByText(/\d+-questions and a writing task/).evaluate((element) => element.textContent ?? '');
  const total = Number(bannerText.match(/(\d+)-questions/)?.[1] ?? 24);
  for (let question = 1; question < total; question++) {
    await page.getByRole('heading', { name: `Question ${question} of ${total}` }).waitFor({ timeout: 20_000 });
    await page.locator('main .space-y-2\\.5 > button').first().click();
    await page.getByRole('button', { name: 'Next Question', exact: true }).click();
  }
  await page.getByRole('heading', { name: `Question ${total} of ${total}` }).waitFor({ timeout: 20_000 });
  await page.locator('main .space-y-2\\.5 > button').first().click();
  await page.waitForTimeout(400);

  const hit = await page.evaluate(() => {
    const button = [...document.querySelectorAll('main button')]
      .find((element) => /Continue to Writing Sample/.test(element.textContent || ''));
    if (!button) return 'continue button missing';
    const rect = button.getBoundingClientRect();
    button.scrollIntoView({ block: 'center' });
    const settled = button.getBoundingClientRect();
    const target = document.elementFromPoint(settled.right - 12, settled.top + settled.height / 2);
    const reached = target?.closest('button') === button;
    const reporter = [...document.querySelectorAll('button')]
      .find((element) => (element.textContent || '').trim() === 'Problem? Tell us');
    const reporterRect = reporter?.getBoundingClientRect();
    const overlaps = reporterRect
      ? reporterRect.left < rect.right && reporterRect.right > rect.left
        && reporterRect.top < rect.bottom && reporterRect.bottom > rect.top
      : false;
    return reached && !overlaps ? 'ok' : `reached=${reached} overlaps=${overlaps} target=${target?.textContent?.trim().slice(0, 40)}`;
  });
  announce(`small_phone_continue_target=${hit}`);
  assert.equal(hit, 'ok', 'on a 375x667 phone the Continue button must be tappable and clear of the report button');
}

const browser = await chromium.launch();
let user = null;
try {
  const signedOut = await browser.newContext();
  const signedOutPage = await signedOut.newPage();
  await walk(signedOutPage, 'signedout', { width: 1280, height: 720 });
  await checkSmallPhoneLayout(signedOutPage);
  await signedOut.close();

  if (!admin) {
    announce('signedin=skipped (no service role key; set SUPABASE_SERVICE_ROLE_KEY)');
  } else {
    user = await createTestUser(admin, 'placement-prod-test');
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByLabel(/Email address/i).fill(user.email);
    await page.getByLabel(/^Password/i).fill(user.password);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await page.waitForURL(/\/(dashboard|labs|teacher|onboarding)/, { timeout: 60_000 });
    await walk(page, 'signedin', { width: 1280, height: 720 });
    // Finishing must still work for a signed-in learner (server scoring + save).
    await page.getByRole('button', { name: 'Skip sample' }).click();
    await page.getByRole('heading', { name: 'Placement Check Complete' }).waitFor({ timeout: 30_000 });
    announce('signedin_finish=visible');
    await context.close();
  }
  announce('placement_production_check=passed');
} catch (error) {
  announce(`placement_production_check=failed ${error.message}`);
  process.exitCode = 1;
} finally {
  if (user && admin) await deleteTestUser(admin, user.id).catch((error) => announce(`cleanup=${error.message}`));
  await browser.close();
}

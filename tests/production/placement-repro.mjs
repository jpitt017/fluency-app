#!/usr/bin/env node
/**
 * Opt-in live reproduction of the placement writing-step bug on production.
 *
 * Signs in as a throwaway @example.test learner, answers all 24 questions, clicks
 * "Continue to Writing Sample →" and records what the browser actually saw:
 * console errors, page errors, failed network requests, and whether the button
 * was disabled. It then calls the two endpoints the writing step depends on and
 * prints their status/body, so a wrong hypothesis can be ruled out from evidence.
 *
 *   node tests/production/placement-repro.mjs
 *   PLACEMENT_BASE_URL=http://127.0.0.1:3000 node tests/production/placement-repro.mjs
 *
 * Never marks anything released; it only creates and deletes one test learner.
 */
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const base = process.env.PLACEMENT_BASE_URL || 'https://fluency-app-nine.vercel.app';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

const bank = JSON.parse(readFileSync(new URL('../fixtures/placement-questions-v2.json', import.meta.url)));

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const apiRequests = [];

const report = [];
function log(label, value) {
  const rendered = `${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`;
  report.push(rendered);
  console.log(rendered);
}

/**
 * Job logs, step summaries and artifacts are all unreachable from this sandbox,
 * but workflow annotations are readable through the checks API. Emit the verdict
 * as annotations, chunked to stay under GitHub's per-step limit, and keep the
 * full text in a file for the PR comment.
 */
function writeSummary() {
  const body = ['## Placement writing-step repro', '', '```', ...report, '```', ''].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, body, { flag: 'a' });
  if (process.env.REPRO_OUTPUT) writeFileSync(process.env.REPRO_OUTPUT, body);
  const keys = /^(PROBE|console errors|page errors|failed requests|writing prompt visible|evaluate button count|score error visible|main text)/;
  const lines = report.filter((line) => keys.test(line));
  // GitHub allows 10 warnings per step; the report file is uploaded as well.
  for (let index = 0; index < lines.length && index < 10; index += 1) {
    const text = lines[index].replace(/[\r\n]+/g, ' ').slice(0, 900);
    console.log(`::warning title=placement repro ${index + 1}::${text}`);
  }
}

let user;
let browser;
try {
  const admin = createClient(url, key, { auth: { persistSession: false } });
  user = await createTestUser(admin, 'placement-repro');
  log('stage', 'test user created');

  browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500));
  });
  page.on('pageerror', (error) => pageErrors.push(String(error.message).slice(0, 500)));
  page.on('requestfailed', (request) =>
    failedRequests.push(`${request.method()} ${request.url().slice(0, 200)} — ${request.failure()?.errorText}`),
  );
  page.on('response', (response) => {
    const requestUrl = new URL(response.url());
    if (requestUrl.pathname.startsWith('/api/')) {
      apiRequests.push(`${response.request().method()} ${requestUrl.pathname} → ${response.status()}`);
    }
  });

  // --- sign in ---
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email address', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // `waitForURL` waits for a load event, which an App Router client-side redirect
  // may never fire. Poll the URL instead.
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), null, { timeout: 30000 });
  log('stage', `signed in, at ${page.url()}`);

  // --- the quiz ---
  const quiz = await page.goto(`${base}/onboarding/placement`, { waitUntil: 'domcontentloaded' });
  log('placement page status', quiz?.status() ?? 'unknown');
  log('heading', (await page.getByRole('heading', { level: 1 }).first().innerText()).trim());

  // Locators prefer stable test ids (the fixed component has them) and fall back
  // to the deployed markup: the quiz options are the buttons between the question
  // and the single Next/Continue button, which is the last button in `main`.
  const NON_OPTION = /^(Next Question|Continue to Writing Sample|Problem\? Tell us|Close|Skip sample|Evaluate|Try again|Sign in|Delete my learning data)/;
  async function optionCount() {
    const tagged = page.locator('[data-testid="placement-option"]');
    if (await tagged.count()) return { locator: tagged, count: await tagged.count(), tagged: true };
    const all = page.locator('main button[type="button"]');
    const total = await all.count();
    const indexes = [];
    for (let i = 0; i < total; i += 1) {
      const text = (await all.nth(i).innerText()).trim();
      if (!NON_OPTION.test(text)) indexes.push(i);
    }
    return { locator: all, indexes, count: indexes.length, tagged: false };
  }
  async function nextButton() {
    const tagged = page.locator('[data-testid="placement-next"]');
    if (await tagged.count()) return tagged.first();
    return page.locator('main button[type="button"]').last();
  }

  let q24State = null;
  for (let index = 0; index < 24; index += 1) {
    await page.getByRole('heading', { name: `Question ${index + 1} of 24` }).waitFor({ timeout: 20000 });
    const options = await optionCount();
    if (index === 0) {
      const labels = await page.locator('main button[type="button"]').allInnerTexts();
      log('buttons at q1', labels.map((text) => text.trim().slice(0, 40)));
      log('q1 option count', String(options.count));
      log('q1 uses test ids', String(options.tagged));
    }
    if (!options.count) throw new Error(`Question ${index + 1} rendered no answer options`);
    const target = options.tagged ? options.locator.first() : options.locator.nth(options.indexes[0]);
    await target.click();
    const next = await nextButton();
    if (index === 23) {
      q24State = {
        text: (await next.innerText()).trim(),
        disabled: await next.isDisabled(),
        enabled: await next.isEnabled(),
      };
      log('q24 button', q24State);
      await expectEnabled(next);
    }
    await next.click();
    if (index === 23) break;
  }

  async function expectEnabled(locator) {
    // A disabled Continue button is a bug in itself; record it, do not click it.
    if (await locator.isDisabled()) log('q24 button is DISABLED before click', 'yes');
  }

  // --- the moment under test ---
  await page.waitForTimeout(1500);
  log('after clicking q24 URL', page.url());
  const h1 = await page.getByRole('heading', { level: 1 }).allInnerTexts();
  log('h1 after click', h1.map((text) => text.trim()));
  log('textarea count', String(await page.locator('textarea').count()));
  log('writing prompt visible', String(await page.getByText(/60.100 words/).count()));
  log('evaluate button count', String(await page.getByRole('button', { name: /Evaluate/ }).count()));
  log('score error visible', String(await page.getByRole('alert').count()));
  log('writing counter', (await page.getByTestId('writing-word-counter').innerText().catch(() => '(none)')).trim());
  log('hint', (await page.getByTestId('writing-hint').innerText().catch(() => '(none)')).trim());
  log('body text length', String((await page.locator('main').innerText()).length));
  log('main text (first 600)', (await page.locator('main').innerText()).slice(0, 600).replace(/\s+/g, ' '));

  // --- probe the endpoints the writing step depends on ---
  for (const [path, body] of [
    ['/api/placement/score', { answers: Array.from({ length: 24 }, () => 0) }],
    [
      '/api/writing/correct',
      {
        text: 'I am learning English because I want to speak with my colleagues in Dublin. I find it hard to talk about technical topics on the phone.',
        prompt: 'Placement writing sample',
        variety: 'British',
      },
    ],
  ]) {
    const response = await page.request.post(`${base}${path}`, { data: body });
    const text = (await response.text()).slice(0, 400);
    log(`PROBE ${path}`, `${response.status()} ${text}`);
  }
} catch (error) {
  console.log(`::error::repro failed: ${String(error?.message ?? error).replace(/[\r\n%]/g, ' ')}`);
} finally {
  log('console errors', consoleErrors);
  log('page errors', pageErrors);
  log('failed requests', failedRequests);
  log('api requests', apiRequests);
  writeSummary();
  if (browser) await browser.close();
  if (user) {
    const admin = createClient(url, key, { auth: { persistSession: false } });
    await deleteTestUser(admin, user.id);
    log('cleanup', `deleted ${user.email}`);
  }
}

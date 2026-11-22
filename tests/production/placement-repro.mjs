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

/** GitHub strips job logs for this repo's runs, so the summary is the transport. */
function writeSummary() {
  const body = ['## Placement writing-step repro', '', '```', ...report, '```', ''].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, body, { flag: 'a' });
  if (process.env.REPRO_OUTPUT) writeFileSync(process.env.REPRO_OUTPUT, body);
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
  await page.waitForURL((target) => !target.pathname.startsWith('/login'), { timeout: 30000 });
  log('stage', `signed in, at ${page.url()}`);

  // --- the quiz ---
  const quiz = await page.goto(`${base}/onboarding/placement`, { waitUntil: 'domcontentloaded' });
  log('placement page status', quiz?.status() ?? 'unknown');
  log('heading', (await page.getByRole('heading', { level: 1 }).first().innerText()).trim());

  let q24Button = null;
  for (let index = 0; index < 24; index += 1) {
    const heading = page.getByRole('heading', { name: `Question ${index + 1} of 24` });
    await heading.waitFor({ timeout: 15000 });
    // Pick the first rendered option, whatever it says, so copy changes cannot
    // hide the bug. The bank is only used to know how many options exist.
    const optionCount = bank.questions[index]?.options.length ?? 4;
    const buttons = page.locator('main button[type="button"]');
    // The last button is "Next Question" / "Continue to Writing Sample →".
    const optionButtons = buttons.filter({ hasNotText: /Next Question|Continue to Writing Sample/ });
    const rendered = await optionButtons.count();
    log(`q${index + 1} options rendered`, `${rendered} (fixture has ${optionCount})`);
    await optionButtons.first().click();
    const next = buttons.filter({ hasText: /Next Question|Continue to Writing Sample/ }).first();
    if (index === 23) {
      q24Button = next;
      log('q24 button text', (await next.innerText()).trim());
      log('q24 button disabled', String(await next.isDisabled()));
    }
    await next.click();
    await page.waitForTimeout(150);
    if (index === 23) break;
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

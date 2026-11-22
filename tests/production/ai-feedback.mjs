#!/usr/bin/env node
// Opt-in live smoke test: real login, real browser requests and real AI services.
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const base = process.env.AI_TEST_PREVIEW === 'true'
  ? 'https://fluency-app-git-arena-f6482574-fluency-app-jpitt017.vercel.app'
  : 'https://fluency-app-nine.vercel.app';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url !== 'https://ebzmkhrssgnzmixfsuso.supabase.co' || !key) throw new Error('Production Supabase URL and service key required');
const admin = createClient(url, key, { auth: { persistSession: false } });
const dir = mkdtempSync(join(tmpdir(), 'fluency-ai-test-'));
let user, browser;
let stage = 'prepare audio';
try {
  const wav = join(dir, 'speech.wav');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-i', 'public/audio/module-1/the-year-everything-changed.mp3', '-ar', '44100', '-ac', '1', wav]);
  stage = 'create test user';
  user = await createTestUser(admin, 'ai-prod-test');
  browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`] });
  const context = await browser.newContext({ permissions: ['microphone'] });
  const page = await context.newPage();
  stage = 'load login';
  const loginResponse = await page.goto(`${base}/login?next=/labs`, { waitUntil: 'domcontentloaded' });
  if (!loginResponse?.ok() || !(await page.getByLabel('Email address', { exact: true }).count())) {
    console.log(`::error::Login page unavailable: HTTP ${loginResponse?.status() ?? 'unknown'}, title ${String(await page.title()).replace(/[\r\n%]/g, ' ')}`);
    throw new Error('Login page unavailable');
  }
  stage = 'fill sign-in form';
  await page.getByLabel('Email address', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  stage = 'submit sign-in form';
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  stage = 'wait for signed-in redirect';
  await page.waitForURL('**/labs', { timeout: 30000 });
  stage = 'writing';
  const writing = page.locator('#writing');
  await writing.locator('textarea').fill(`Last year I visited a new city with my friends. We enjoyed the local food and learned about its history. ${Date.now()}`);
  const writingResponse = page.waitForResponse(r => r.url().endsWith('/api/writing/correct') && r.request().method() === 'POST', { timeout: 120000 });
  await writing.getByRole('button', { name: 'Evaluate writing' }).click();
  const wr = await writingResponse;
  const wb = await wr.json();
  console.log('Writing response:', wr.status(), wb.error ?? 'feedback received');
  if (!wr.ok()) console.log(`::error::Writing returned HTTP ${wr.status()}: ${String(wb.error ?? 'unknown error').replace(/[\r\n%]/g, ' ')}`);
  assert.equal(wr.status(), 200, 'Writing evaluation failed');
  assert.ok(typeof wb.feedback === 'string' && wb.feedback.trim(), 'Writing feedback missing');
  await writing.getByRole('status').waitFor({ timeout: 30000 });
  stage = 'speaking';
  const speaking = page.locator('#speaking');
  await speaking.getByRole('button', { name: 'Start recording' }).click();
  await speaking.getByRole('button', { name: 'Stop recording' }).waitFor();
  await page.waitForTimeout(8000);
  const speakingResponse = page.waitForResponse(r => r.url().endsWith('/api/speaking/evaluate') && r.request().method() === 'POST', { timeout: 120000 });
  await speaking.getByRole('button', { name: 'Stop recording' }).click();
  const sr = await speakingResponse;
  const sb = await sr.json();
  console.log('Speaking response:', sr.status(), sb.error ?? 'feedback received');
  if (!sr.ok()) console.log(`::error::Speaking returned HTTP ${sr.status()}: ${String(sb.error ?? 'unknown error').replace(/[\r\n%]/g, ' ')}`);
  assert.equal(sr.status(), 200, 'Speaking evaluation failed');
  assert.ok(typeof sb.feedback === 'string' && sb.feedback.trim(), 'Speaking feedback missing');
  assert.ok(typeof sb.transcript === 'string' && sb.transcript.trim(), 'Transcription missing');
  await speaking.getByRole('status').waitFor({ timeout: 30000 });
  console.log('Real writing and audio speaking feedback displayed successfully.');
} catch (error) {
  console.log(`::error::Live AI smoke test failed at stage: ${stage}`);
  throw error;
} finally {
  if (browser) await browser.close();
  try { if (user) await deleteTestUser(admin, user.id); } finally { rmSync(dir, { recursive: true, force: true }); }
}

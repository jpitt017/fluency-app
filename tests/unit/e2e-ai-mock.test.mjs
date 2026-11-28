import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const preload = path.resolve('tests/e2e/helpers/mock-ai-provider.cjs');
const report = path.resolve('scripts/report-e2e-ai-audit.mjs');
const timingReport = path.resolve('scripts/report-e2e-ai-timings.mjs');

function child(audit, code, overrides = {}) {
  return spawnSync(process.execPath, ['--require', preload, '--input-type=module', '--eval', code], {
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      GROQ_BASE_URL: 'http://127.0.0.1:1',
      GROQ_API_KEY: 'e2e-mock-only',
      E2E_AI_MOCK_AUDIT_FILE: audit,
      ...overrides,
    },
    encoding: 'utf8',
    timeout: 15_000,
  });
}

test('the real Groq SDK gets a synthetic response, while live AI hosts are blocked', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'e2e-ai-mock-'));
  const audit = path.join(dir, 'audit.txt');
  try {
    const run = child(audit, `
      import assert from 'node:assert/strict';
      import Groq from 'groq-sdk';
      const client = new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 0 });
      await assert.rejects(client.chat.completions.create({ model: 'fake', messages: [] }),
        (error) => error.status === 401 && /Synthetic E2E provider failure/.test(error.message));
      const audio = await fetch('http://127.0.0.1:1/openai/v1/audio/transcriptions');
      assert.equal(audio.status, 401);
      await assert.rejects(fetch('https://api.groq.com/openai/v1/chat/completions'), /blocked during E2E/);
      await assert.rejects(fetch('https://api.openai.com/v1/chat/completions'), /blocked during E2E/);
      assert.equal(await (await fetch('data:text/plain,unrelated')).text(), 'unrelated');
    `);
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    assert.deepEqual(readFileSync(audit, 'utf8').trim().split('\n'), ['mock', 'mock', 'blocked', 'blocked']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the preload refuses a real key, non-loopback provider URL, or missing audit', () => {
  const audit = path.join(tmpdir(), 'unused-e2e-ai-audit');
  for (const [overrides, message] of [
    [{ GROQ_API_KEY: 'not-an-e2e-mock-key' }, /real AI provider key/],
    [{ GROQ_BASE_URL: 'https://api.groq.com' }, /loopback-only URL/],
    [{ E2E_AI_MOCK_AUDIT_FILE: '' }, /audit file/],
  ]) {
    const run = child(audit, '', overrides);
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, message);
  }
});

test('the audit fails on live attempts and requires an actual mock when requested', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'e2e-ai-audit-'));
  const audit = path.join(dir, 'audit.txt');
  const run = (args = []) => spawnSync(process.execPath, [report, ...args], {
    env: { ...process.env, NODE_OPTIONS: '', E2E_AI_MOCK_AUDIT_FILE: audit }, encoding: 'utf8',
  });
  try {
    writeFileSync(audit, '');
    assert.equal(run().status, 0);
    assert.notEqual(run(['--require-mock']).status, 0);
    writeFileSync(audit, 'mock\n');
    assert.equal(run(['--require-mock']).status, 0);
    writeFileSync(audit, 'mock\nblocked\n');
    assert.notEqual(run().status, 0);
    writeFileSync(audit, 'unexpected\n');
    assert.notEqual(run().status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stage timing annotations include unfinished stages without request data', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'e2e-ai-timing-'));
  const file = path.join(dir, 'timings.jsonl');
  const run = () => spawnSync(process.execPath, [timingReport], {
    env: { ...process.env, NODE_OPTIONS: '', E2E_AI_LOG_TIMING_FILE: file }, encoding: 'utf8',
  });
  try {
    writeFileSync(file, '');
    assert.match(run().stdout, /No stages were recorded/);
    writeFileSync(file, [
      { retry: 0, label: 'anonymous logging RPC', phase: 'start' },
      { retry: 0, label: 'anonymous logging RPC', phase: 'finish', ms: 42 },
      { retry: 0, label: 'browser sign-in', phase: 'start' },
      { retry: 1, label: 'anonymous logging RPC', phase: 'start' },
      { retry: 1, label: 'anonymous logging RPC', phase: 'finish', ms: 23 },
    ].map((event) => JSON.stringify(event)).join('\n') + '\n');
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Attempt 1: anonymous logging RPC: 42ms; browser sign-in: interrupted/);
    assert.match(result.stdout, /Attempt 2: anonymous logging RPC: 23ms/);
    writeFileSync(file, `${JSON.stringify({ retry: 0, label: 'bad\n::error::injection', phase: 'start' })}\n`);
    assert.notEqual(run().status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('all hosted browser phases use the offline guard and run the logging test exactly once', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  for (const name of [
    'Test new app against 0080 on isolated Supabase',
    'Test pre-0081 app against expanded isolated Supabase',
    'Run Playwright E2E tests',
    'Verify post-overlap upload fence on isolated E2E project',
  ]) {
    const start = workflow.indexOf(`      - name: ${name}\n`);
    assert.notEqual(start, -1, name);
    const next = workflow.indexOf('\n      - name:', start + 1);
    const step = workflow.slice(start, next === -1 ? undefined : next);
    assert.match(step, /GROQ_BASE_URL: http:\/\/127\.0\.0\.1:1/);
    assert.match(step, /NODE_OPTIONS: --require=.*mock-ai-provider\.cjs/);
    assert.match(step, /E2E_AI_MOCK_AUDIT_FILE:/);
    assert.match(step, /GROQ_API_KEY: ''/);
  }
  assert.match(workflow, /GROQ_API_KEY=e2e-mock-only npm run test:e2e -- tests\/e2e\/ai-request-logging\.spec\.mjs/);
  assert.match(workflow, /report-e2e-ai-audit\.mjs --require-mock/);
  assert.match(workflow, /--grep-invert '[^'\n]*ai-request-logging/);

  const runner = path.resolve('node_modules/@playwright/test/cli.js');
  const excluded = spawnSync(process.execPath, [runner, 'test', '--list', '--grep-invert',
    'week-speaking-feedback\\.spec\\.mjs|retryable-data-deletion\\.spec\\.mjs|ai-request-logging\\.spec\\.mjs'],
  { env: { ...process.env, NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 15_000 });
  assert.equal(excluded.status, 0, excluded.stderr);
  for (const file of ['week-speaking-feedback.spec.mjs', 'retryable-data-deletion.spec.mjs', 'ai-request-logging.spec.mjs']) {
    assert.ok(!excluded.stdout.includes(file), `${file} must be excluded from the last invocation`);
  }
  const targeted = spawnSync(process.execPath, [runner, 'test', '--list', 'tests/e2e/ai-request-logging.spec.mjs'],
    { env: { ...process.env, NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 15_000 });
  assert.equal(targeted.status, 0, targeted.stderr);
  assert.match(targeted.stdout, /ai-request-logging\.spec\.mjs/);
  assert.match(targeted.stdout, /Total: 1 test/);
});

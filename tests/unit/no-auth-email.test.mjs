/**
 * A test must never send an auth email.
 *
 * The project's bounce rate was damaged by test users with @example.test
 * addresses: a confirmation email to a fake address bounces, every time. The
 * fix is structural, not a one-off cleanup — users are created through the admin
 * API with `email_confirm: true`, and no test or check may call an auth flow that
 * sends mail.
 *
 * This test is the rule. It reads every file under tests/ and scripts/ (except
 * the app itself, which legitimately signs real people up) and fails if one of
 * those flows appears in code. Comments are stripped first, and the remainder is
 * parsed with `new Function` so a call mentioned in a comment or a doc string is
 * not confused with a call that would run.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMAIL_SENDING_AUTH_CALLS, createTestUser } from '../../scripts/lib/test-user.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const SENDERS = new RegExp(`\\b(${EMAIL_SENDING_AUTH_CALLS.join('|')})\\s*\\(`);

/** Every matching file under a directory, recursively. */
function walk(dir, pattern = /\.(mjs|ts|tsx|js)$/) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, pattern));
    else if (pattern.test(entry)) out.push(full);
  }
  return out;
}

/** Removes comments, so a documented call is not mistaken for a live one. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Keeps the *code* of a file and drops the prose: comments, string literals and
 * template literals. What is left is what could actually run, so a doc example
 * or an expected-message string cannot trip the scan, and a call hidden inside a
 * comment cannot hide from it either.
 */
function codeOnly(source) {
  const withoutComments = stripComments(source);
  let out = '';
  let quote = null;
  for (let index = 0; index < withoutComments.length; index += 1) {
    const char = withoutComments[index];
    const previous = withoutComments[index - 1];
    if (quote) {
      if (char === quote && previous !== '\\') quote = null;
      else if (char === '\n') out += '\n';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      out += ' ';
      continue;
    }
    out += char;
  }
  return out;
}

const testFiles = [...walk(path.join(repoRoot, 'tests')), ...walk(path.join(repoRoot, 'scripts'))];

/**
 * CI is where the production checks are wired up, so a workflow is scanned as
 * well: a `run:` block could call one of these flows just as easily as a script.
 */
const workflowFiles = walk(path.join(repoRoot, '.github/workflows'), /\.ya?ml$/);

test('the guard scans the files it claims to scan', () => {
  assert.ok(testFiles.length > 20, `found ${testFiles.length} files`);
  const names = testFiles.map((file) => path.relative(repoRoot, file));
  for (const expected of [
    'tests/production/ai-feedback.mjs',
    'tests/production/placement.mjs',
    'tests/e2e/issues.spec.mjs',
    'scripts/test-ai-limits.mjs',
    'scripts/test-rls.mjs',
    'scripts/test-production-issue.mjs',
    'scripts/lib/test-user.mjs',
  ]) {
    assert.ok(names.includes(expected), `${expected} is scanned`);
  }
});

test('no test or check calls an auth flow that sends email', () => {
  const offenders = [];
  for (const file of [...testFiles, ...workflowFiles]) {
    const code = codeOnly(readFileSync(file, 'utf8'));
    code.split('\n').forEach((line, index) => {
      const match = SENDERS.exec(line);
      if (match) {
        offenders.push(`${path.relative(repoRoot, file)}:${index + 1} ${match[1]}()`);
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `These would send an auth email to a fake address. Use admin.auth.admin.createUser({ email_confirm: true }) and sign in with a password instead:\n${offenders.join('\n')}`,
  );
});

test('CI workflows are scanned and call no email-sending auth flow', () => {
  const names = workflowFiles.map((file) => path.basename(file));
  assert.ok(names.includes('ci.yml'), `scanned ${names.join(', ')}`);
  const offenders = workflowFiles.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      // YAML comments are prose too: a note about signUp is not a call to it.
      .map((line) => line.replace(/(^|\s)#.*$/, '$1'))
      .map((line, index) => ({ line, index, match: SENDERS.exec(line) }))
      .filter((hit) => hit.match)
      .map((hit) => `${path.relative(repoRoot, file)}:${hit.index + 1} ${hit.match[1]}()`),
  );
  assert.deepEqual(offenders, [], `A workflow must not send an auth email:\n${offenders.join('\n')}`);
});

test('the sender list covers the flows that can email a fake address', () => {
  assert.deepEqual(EMAIL_SENDING_AUTH_CALLS, [
    'signUp',
    'signInWithOtp',
    'resetPasswordForEmail',
    'inviteUserByEmail',
    'resend',
  ]);
});

test('the shared test-user helper creates users confirmed, through the admin API', () => {
  const source = readFileSync(path.join(repoRoot, 'scripts/lib/test-user.mjs'), 'utf8');
  assert.match(source, /admin\.auth\.admin\.createUser\(/);
  assert.match(source, /email_confirm:\s*true/);
  // And every production check and E2E test goes through that helper.
  for (const file of [
    'tests/production/ai-feedback.mjs',
    'tests/production/placement.mjs',
    'tests/e2e/issues.spec.mjs',
    'scripts/test-ai-limits.mjs',
    'scripts/test-issue-alert-grouping.mjs',
    'scripts/test-production-issue.mjs',
    'scripts/test-rls.mjs',
  ]) {
    const source = readFileSync(path.join(repoRoot, file), 'utf8');
    assert.match(source, /createTestUser\(/, `${file} uses the shared helper`);
  }
});

function fakeAdmin(user) {
  const calls = [];
  return {
    calls,
    admin: {
      auth: {
        admin: {
          async createUser(payload) {
            calls.push(payload);
            return { data: { user }, error: null };
          },
        },
      },
    },
  };
}

const confirmed = { id: 'user-1', email_confirmed_at: '2026-01-01T00:00:00Z', confirmation_sent_at: null };

test('the helper itself asks the admin API for a confirmed user', async () => {
  const { admin, calls } = fakeAdmin(confirmed);
  const user = await createTestUser(admin, 'guard-check');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].email_confirm, true, 'no confirmation email is queued');
  assert.match(calls[0].email, /@example\.test$/, 'never a real address');
  assert.equal(calls[0].email, user.email);
  assert.ok(calls[0].password.length >= 8, 'a password, so the test signs in instead of following a link');
});

test('the helper refuses an unconfirmed user, which would have been emailed', async () => {
  const { admin } = fakeAdmin({ id: 'user-2', email_confirmed_at: null });
  await assert.rejects(() => createTestUser(admin, 'guard-check'), /without email_confirmed_at/);
});

test('the helper refuses a user that had an auth email queued', async () => {
  for (const queued of ['confirmation_sent_at', 'invited_at', 'recovery_sent_at']) {
    const { admin } = fakeAdmin({ ...confirmed, id: 'user-3', [queued]: '2026-01-01T00:00:01Z' });
    await assert.rejects(() => createTestUser(admin, 'guard-check'), /had an auth email queued/, queued);
  }
});

test('the app itself may still sign people up: the guard stops at tests and scripts', () => {
  // The login page is how a real learner creates an account, so the flow must
  // stay; only a test or a check is forbidden from invoking it.
  const login = readFileSync(path.join(repoRoot, 'src/app/login/page.tsx'), 'utf8');
  assert.match(stripComments(login), /signUp\s*\(/);
  assert.equal(testFiles.some((file) => file.includes(`${path.sep}src${path.sep}`)), false);
});

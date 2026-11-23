/**
 * "Is the live site serving the latest main?" has to be answerable by a machine.
 *
 * Reading strings off a page and deciding whether they look new is how a current
 * deploy got called stale. `/api/version` returns the commit Vercel built, and
 * this test keeps that answer honest: it must come from the build environment,
 * must never be cached, and must not leak anything.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const routePath = new URL('../../src/app/api/version/route.ts', import.meta.url);

test('the version route answers the deploy question', () => {
  const source = readFileSync(routePath, 'utf8');
  assert.match(source, /VERCEL_GIT_COMMIT_SHA/, 'commit comes from the build, not a request');
  assert.match(source, /export const dynamic = 'force-dynamic'/);
  assert.match(source, /no-store/, 'a cached answer is worse than no answer');
  assert.match(source, /shortCommit/, 'a 7-character form is what compares to git rev-parse --short');
});

test('the version route exposes nothing sensitive', () => {
  const source = readFileSync(routePath, 'utf8');
  for (const forbidden of ['SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'GROQ_API_KEY', 'CRON_SECRET', 'password']) {
    assert.ok(!source.includes(forbidden), `${forbidden} must not appear`);
  }
  // It reads a commit id, a branch name and an environment name, nothing else.
  assert.equal((source.match(/process\.env\./g) ?? []).length <= 5, true);
});

test('the version route is not blocked by the proxy', () => {
  // The proxy lets /api/ through to the route's own auth checks; /api/version
  // has nothing to protect, and a 503 here would make the deploy unverifiable.
  const proxy = readFileSync(new URL('../../src/proxy.ts', import.meta.url), 'utf8');
  assert.ok(!proxy.includes("'/api/version'"), 'no special-case block for the version route');
});

test('the login page and callback both carry the fixes from this round', () => {
  const login = readFileSync(new URL('../../src/app/login/page.tsx', import.meta.url), 'utf8');
  // 1. Reset redirect is encoded once, through the helper.
  assert.match(login, /buildRedirectTo\(window\.location\.origin, UPDATE_PASSWORD_PATH\)/);
  assert.doesNotMatch(login, /auth\/callback\?next=\$\{encodeURIComponent/);
  // 2. ?mode=sign-up opens the sign-up tab.
  assert.match(login, /useState\(startsInSignUpMode\)/);
  assert.match(login, /mode === 'sign-up'/);

  const callback = readFileSync(new URL('../../src/app/auth/callback/route.ts', import.meta.url), 'utf8');
  assert.match(callback, /landingPath\(decodedNext, type\)/);
  assert.match(callback, /verifyOtp\(\{ token_hash: tokenHash, type \}\)/);
});

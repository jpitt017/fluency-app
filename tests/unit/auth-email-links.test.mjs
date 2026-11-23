/**
 * The email-link contract: where a link lands, and under what circumstances it
 * falls back.
 *
 * A break here is invisible in a browser test that signs in with a password, so
 * it is pinned here instead: the `type` per flow, the single encoding of `next`,
 * and the guard that stops an off-site redirect.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_NEXT,
  EMAIL_ACTION_TYPES,
  EMAIL_LINKS_ENABLED_ENV,
  RESET_LINK_REPLACEMENT,
  SIGNUP_DESTINATION,
  emailLinksEnabled,
  signUpOutcome,
  TEMPLATE_NEXT,
  UPDATE_PASSWORD_PATH,
  buildRedirectTo,
  landingPath,
  safeNextPath,
} from '../../lib/auth/email-links.mjs';

const ORIGIN = 'https://fluency-app-nine.vercel.app';

test('each email action uses the type GoTrue verifies, not the template name', () => {
  // The common mistake is `type=email` for a sign-up: GoTrue then rejects a
  // valid token. These five are the values its verify endpoint accepts.
  assert.deepEqual(EMAIL_ACTION_TYPES, {
    confirmSignup: 'signup',
    magicLink: 'magiclink',
    resetPassword: 'recovery',
    changeEmail: 'email_change',
    invite: 'invite',
  });
});

test('a password reset lands on the form that asks for a new password', () => {
  assert.equal(EMAIL_ACTION_TYPES.resetPassword, 'recovery');
  assert.equal(TEMPLATE_NEXT.resetPassword, UPDATE_PASSWORD_PATH);
  assert.equal(UPDATE_PASSWORD_PATH, '/login?mode=update-password');
});

test('confirm signup and magic link land on the dashboard', () => {
  assert.equal(TEMPLATE_NEXT.confirmSignup, '/dashboard');
  assert.equal(TEMPLATE_NEXT.magicLink, '/dashboard');
  assert.equal(DEFAULT_NEXT, '/dashboard');
});

test('next is encoded exactly once', () => {
  const url = buildRedirectTo(ORIGIN, UPDATE_PASSWORD_PATH);
  assert.equal(url, `${ORIGIN}/auth/callback?next=%2Flogin%3Fmode%3Dupdate-password`);
  // One decode gives back the exact path. If it were encoded twice this would
  // still start with '%' and the callback would reject it.
  const next = new URL(url).searchParams.get('next');
  assert.equal(next, UPDATE_PASSWORD_PATH);
  assert.equal(decodeURIComponent(next), UPDATE_PASSWORD_PATH);
});

test('the callback decodes what GoTrue re-encoded, so a reset opens the form', () => {
  // What the template receives: GoTrue put our redirectTo inside redirect_to.
  const redirectTo = buildRedirectTo(ORIGIN, UPDATE_PASSWORD_PATH);
  const asGoTrueSendsIt = decodeURIComponent(
    new URL(`https://x/auth/v1/verify?redirect_to=${encodeURIComponent(redirectTo)}`).searchParams.get('redirect_to'),
  );
  const arrived = new URL(asGoTrueSendsIt).searchParams.get('next');
  // Arrived already-decoded: the route then resolves it to the password form.
  assert.equal(arrived, UPDATE_PASSWORD_PATH);
  assert.equal(landingPath(arrived, 'recovery'), UPDATE_PASSWORD_PATH);
});

test('a reset with no next still opens the password form', () => {
  assert.equal(landingPath(null, 'recovery'), UPDATE_PASSWORD_PATH);
  assert.equal(landingPath('', 'recovery'), UPDATE_PASSWORD_PATH);
  assert.equal(landingPath(undefined, 'signup'), '/dashboard');
});

test('only a same-site path is ever followed', () => {
  for (const hostile of [
    'https://evil.example/steal',
    '//evil.example/steal',
    '/\\evil.example',
    '/ok\u0000/../evil',
    'javascript:alert(1)',
    'dashboard',
  ]) {
    assert.equal(safeNextPath(hostile, 'magiclink'), '/dashboard', hostile);
  }
  assert.equal(safeNextPath('/week/3', 'magiclink'), '/week/3');
  assert.equal(safeNextPath('/login?mode=update-password', 'recovery'), UPDATE_PASSWORD_PATH);
});

test('a path with parent segments can never leave the origin', () => {
  // `/../..` is normalised by the browser to `/`, which is same-site: the test
  // asserts the origin is unchanged, not that the string is pretty.
  for (const candidate of ['/../../etc/passwd', '/week/../../..//evil']) {
    const landed = new URL(safeNextPath(candidate, 'magiclink'), ORIGIN);
    assert.equal(landed.origin, ORIGIN, candidate);
  }
  // An absolute URL that is not percent-encoded is rejected outright.
  assert.equal(safeNextPath('https%3A%2F%2Fevil.example', 'magiclink'), '/dashboard');
});

test('the route reads token_hash and prefers the link next over its own default', () => {
  const source = readFileSync(new URL('../../src/app/auth/callback/route.ts', import.meta.url), 'utf8');
  assert.match(source, /searchParams\.get\('token_hash'\)/);
  assert.match(source, /verifyOtp\(\{ token_hash: tokenHash, type \}\)/);
  assert.match(source, /landingPath\(decodedNext, type\)/);
  assert.match(source, /exchangeCodeForSession\(code\)/);
});

test('the callback redirects on the host the link was opened on', () => {
  const source = readFileSync(new URL('../../src/app/auth/callback/route.ts', import.meta.url), 'utf8');
  // Behind a proxy the bound address is not the visitor's host; using it would
  // set the session cookie on the wrong origin.
  assert.match(source, /x-forwarded-host/);
  assert.match(source, /const origin = siteOrigin\(request\)/);
});

test('the login page sends single-encoded redirects and opens the sign-up tab', () => {
  const source = readFileSync(new URL('../../src/app/login/page.tsx', import.meta.url), 'utf8');
  // Every redirect goes through the helper; no hand-rolled encodeURIComponent.
  assert.doesNotMatch(source, /auth\/callback\?next=\$\{encodeURIComponent/);
  assert.equal((source.match(/buildRedirectTo\(/g) ?? []).length, 3, 'magic link, reset and sign-up');
  assert.match(source, /useState\(startsInSignUpMode\)/);
  assert.match(source, /mode === 'sign-up'/);
});

test('the template variable is TokenHash, not ConfirmationURL', () => {
  // ConfirmationURL points at /auth/v1/verify, which returns the token in a URL
  // fragment the server never sees. Templates must build the link themselves.
  const docs = readFileSync(new URL('../../docs/AUTH_EMAIL_TEMPLATES.md', import.meta.url), 'utf8');
  assert.match(docs, /\{\{ \.TokenHash \}\}/);
  assert.doesNotMatch(docs, /href="\{\{ \.ConfirmationURL \}\}"/);
  for (const type of ['signup', 'magiclink', 'recovery', 'email_change', 'invite']) {
    assert.ok(docs.includes(`type=${type}`), `the template list covers type=${type}`);
  }
});

test('email links are off unless explicitly switched on', () => {
  // A pilot without SMTP must never show a control that can only fail.
  assert.equal(emailLinksEnabled(undefined), false);
  assert.equal(emailLinksEnabled(''), false);
  assert.equal(emailLinksEnabled('false'), false);
  assert.equal(emailLinksEnabled('0'), false);
  assert.equal(emailLinksEnabled('TRUE'), false, 'exact match only');
  assert.equal(emailLinksEnabled('true'), true);
  assert.equal(EMAIL_LINKS_ENABLED_ENV, 'NEXT_PUBLIC_EMAIL_LINKS_ENABLED');
  assert.equal(RESET_LINK_REPLACEMENT, 'Forgot your password? Message your teacher.');
});

test('the login page hides both email options behind the one setting', () => {
  const source = readFileSync(new URL('../../src/app/login/page.tsx', import.meta.url), 'utf8');
  // Both controls test the same flag...
  assert.equal((source.match(/!isSignUp && !isUpdatePassword && emailLinks/g) ?? []).length, 2);
  // ...the reset replacement shows only when it is off...
  assert.match(source, /\{!emailLinks && !isSignUp && !isUpdatePassword && \(/);
  // ...and the setting is resolved on the server, not frozen into the bundle.
  assert.match(source, /emailLinksEnabled\(process\.env\[EMAIL_LINKS_ENABLED_ENV\]\)/);
  assert.match(source, /<LoginForm emailLinks=\{emailLinks\} \/>/);
});

test('sign-up with Confirm email off goes straight to placement', () => {
  // A session in the response is what Supabase returns when confirmation is off.
  assert.equal(signUpOutcome({ user: { identities: [{}] }, session: { access_token: 'x' } }), 'placement');
  assert.equal(SIGNUP_DESTINATION, '/onboarding/placement');

  // With Confirm email on there is no session: ask them to check their inbox.
  assert.equal(signUpOutcome({ user: { identities: [{}] }, session: null }), 'confirm-email');

  // An address that already has an account comes back with no identities.
  assert.equal(signUpOutcome({ user: { identities: [] }, session: null }), 'existing');

  // A malformed payload must not be treated as a successful sign-up.
  assert.equal(signUpOutcome(null), 'confirm-email');
  assert.equal(signUpOutcome({}), 'confirm-email');
});

test('the login page routes each sign-up outcome differently', () => {
  const source = readFileSync(new URL('../../src/app/login/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /const outcome = signUpOutcome\(data\)/);
  assert.match(source, /outcome === SIGNUP_OUTCOMES\.existing/);
  assert.match(source, /outcome === SIGNUP_OUTCOMES\.confirmEmail/);
  // The default branch is the signed-in one, and it must be placement.
  assert.match(source, /window\.location\.assign\(SIGNUP_DESTINATION\)/);
});

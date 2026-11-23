/**
 * The one place that decides where an emailed auth link lands.
 *
 * Supabase's default email link points at `/auth/v1/verify?token=…`, which puts
 * the token in the URL *fragment* and redirects with no `code` for the server to
 * read. Email templates here build the link instead:
 *
 *   {{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=…&next=…
 *
 * so `/auth/callback` gets a `token_hash` it can verify with `verifyOtp`. These
 * helpers keep the `type` and the `next` path in one place, so the templates, the
 * login page and the route cannot drift apart.
 */

/**
 * The `type` GoTrue expects for each email action.
 *
 * Deliberately NOT the template name: sign-up confirmation is `signup` (not
 * `email`), a magic link is `magiclink`, a recovery link is `recovery`. Passing
 * the wrong one makes `verifyOtp` reject a perfectly good token.
 */
export const EMAIL_ACTION_TYPES = Object.freeze({
  confirmSignup: 'signup',
  magicLink: 'magiclink',
  resetPassword: 'recovery',
  changeEmail: 'email_change',
  invite: 'invite',
});

/** Where a password reset should land: the form that asks for a new password. */
export const UPDATE_PASSWORD_PATH = '/login?mode=update-password';

/** The page after a successful sign-in or confirmation. */
export const DEFAULT_NEXT = '/dashboard';

/**
 * Put a destination on the callback so a template can be hard-coded.
 *
 * A mail merge cannot reach into `emailRedirectTo`, so every template carries a
 * fixed `next`. `/auth/callback` prefers the `next` in the link and only then
 * falls back to its own default. Keeping this in one place means the templates
 * and the route always agree.
 */
export const TEMPLATE_NEXT = Object.freeze({
  confirmSignup: '/dashboard',
  magicLink: '/dashboard',
  resetPassword: UPDATE_PASSWORD_PATH,
  changeEmail: '/dashboard',
  invite: '/dashboard',
});

/**
 * Build the destination passed to Supabase as `redirectTo` / `emailRedirectTo`.
 *
 * `next` is encoded **once**: `encodeURIComponent` turns `/login?mode=…` into
 * `%2Flogin%3Fmode%3D…`, and GoTrue then re-encodes the whole URL it embeds in
 * `redirect_to`. Decoding once at the far end therefore gives back the path
 * exactly. Encoding it twice produced `%252F…`, which did not start with `/`,
 * failed the callback's sanity check, and silently fell back to the dashboard.
 */
export function buildRedirectTo(origin, next = DEFAULT_NEXT) {
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

/**
 * Decide where `/auth/callback` sends the browser.
 *
 * Only a same-site path is allowed: anything absolute, protocol-relative
 * (`//evil.example`) or otherwise malformed falls back rather than redirecting
 * off-site. The fallback comes from the action `type`, so a reset link still
 * opens the password form even when it carries no usable `next`.
 */
export function safeNextPath(next, type) {
  const fallback = type === EMAIL_ACTION_TYPES.resetPassword ? UPDATE_PASSWORD_PATH : DEFAULT_NEXT;
  if (typeof next !== 'string' || next.length === 0) return fallback;
  if (!next.startsWith('/')) return fallback;
  if (next.startsWith('//')) return fallback;
  // A backslash is treated as a slash by some browsers, and control characters
  // can smuggle a newline into the Location header.
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}

/** The path after verifyOtp succeeds: the link's own `next`, else the action default. */
export function landingPath(next, type) {
  return safeNextPath(next, type);
}

/**
 * Whether the login page offers the email-based ways in: the magic link and the
 * "Forgot password?" link.
 *
 * Both need Supabase to send mail, which needs custom SMTP on a domain the
 * project does not have while it is a pilot. Until then the buttons would only
 * ever show a rate-limit error, so one setting hides them and the page tells the
 * learner to ask their teacher instead.
 *
 * Read on the server by `src/app/login/page.tsx` and passed down as a prop, so
 * it is evaluated per request, not inlined into the browser bundle. Off unless
 * explicitly on: a pilot without SMTP should never show a control that cannot
 * work.
 */
export const EMAIL_LINKS_ENABLED_ENV = 'NEXT_PUBLIC_EMAIL_LINKS_ENABLED';

/** What a learner sees instead of a reset link while email is unavailable. */
export const RESET_LINK_REPLACEMENT = 'Forgot your password? Message your teacher.';

/** True only for an explicit opt-in; anything else keeps the email options hidden. */
export function emailLinksEnabled(raw) {
  return raw === 'true' || raw === '1';
}

/**
 * What just happened after `signUp`, decided from the response alone.
 *
 * Three outcomes, and they need different UI:
 *
 * - `existing` — Supabase returns a user with no identities when the address is
 *   already registered. Nothing was created; tell them to sign in.
 * - `confirm-email` — no session, so "Confirm email" is on and a message is
 *   waiting. Show "check your email" rather than dropping them on a signed-out
 *   page.
 * - `placement` — a session came back, which is what "Confirm email" turned off
 *   produces. The account is live now, so send them straight to the placement
 *   quiz; a new learner has no band yet.
 */
export const SIGNUP_OUTCOMES = Object.freeze({
  existing: 'existing',
  confirmEmail: 'confirm-email',
  placement: 'placement',
});

/** Where a brand-new, signed-in learner goes: they have no placement yet. */
export const SIGNUP_DESTINATION = '/onboarding/placement';

export function signUpOutcome(data) {
  const user = data?.user;
  if (user && Array.isArray(user.identities) && user.identities.length === 0) {
    return SIGNUP_OUTCOMES.existing;
  }
  if (!data?.session) return SIGNUP_OUTCOMES.confirmEmail;
  return SIGNUP_OUTCOMES.placement;
}

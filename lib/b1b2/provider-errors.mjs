/**
 * One place that decides what a learner is told when an AI provider fails.
 *
 * The provider's own words are for the server log, never for the browser. A raw
 * Groq error can contain the model name, a request id, a token-quota breakdown or
 * "Invalid API Key" — none of which a B1 learner can act on, and some of which
 * are an invitation to probe the deployment.
 *
 * Two things are decided here:
 *
 * 1. which **kind** of failure it is (quota, auth, timeout, rate limit, other),
 *    which drives alerting and the learner-facing wording;
 * 2. what that wording is.
 *
 * The wording depends on one fact the route knows and this module cannot: has
 * the learner's work already been stored? Saying "Your work is saved" when it has
 * not is worse than saying nothing, so callers must state it explicitly.
 */

/** Learner-facing copy. Short sentences, common words, no provider names. */
export const PROVIDER_FAILURE_MESSAGES = Object.freeze({
  /** The provider's daily token allowance is gone: nothing will work until tomorrow. */
  dailyQuota:
    'Feedback has stopped for today. Please try again tomorrow.',
  /** The work is stored, so a retry loses nothing. */
  saved:
    "Feedback isn't working right now. Your work is saved. Please try again later.",
  /** The work is only in the form (or only in this request), so ask them to keep it. */
  unsaved:
    "Feedback isn't working right now. Please copy your text before you try again.",
  /**
   * Same situation, but the work is a recording rather than text. "Copy your
   * text" would be nonsense to someone holding a phone, so the instruction is
   * the recording equivalent: keep it, there is nothing stored to fall back on.
   */
  unsavedRecording:
    "Feedback isn't working right now. Your recording isn't saved. Please try again later.",
});

/**
 * Which failures are worth waking someone up for.
 *
 * A 401 and a 429 are configuration/allowance faults: no retry by a learner will
 * fix them, and they will keep failing for everyone. A timeout or a one-off 500
 * is usually transient and is already logged, so it gets no email. The daily
 * quota is treated the same way as a 429 because it needs a human decision (pay,
 * wait, or switch model) rather than a retry.
 */
export const ALERTING_FAILURE_KINDS = Object.freeze(['auth', 'rate-limit', 'daily-quota']);

/** The machine-readable reason codes returned with a user-safe error. */
export const PROVIDER_FAILURE_CODES = Object.freeze({
  dailyQuota: 'ai_daily_quota',
  saved: 'ai_unavailable_saved',
  unsaved: 'ai_unavailable',
});

/**
 * Read a status code off whatever the SDK threw.
 *
 * `groq-sdk` throws `APIError` with a numeric `status` for HTTP failures, and
 * `APIConnectionTimeoutError`/`APIConnectionError` with `status: undefined`.
 * Some wrappers nest the cause, so that is checked too.
 */
export function providerErrorStatus(error) {
  if (!error || typeof error !== 'object') return null;
  const candidates = [error.status, error.statusCode, error.response?.status, error.cause?.status];
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 100 && value < 600) return value;
  }
  return null;
}

/** The provider's response body, whatever shape the SDK put it in. */
function providerErrorBody(error) {
  if (!error || typeof error !== 'object') return null;
  // groq-sdk: APIError.error holds the parsed JSON body.
  if (error.error && typeof error.error === 'object') return error.error;
  if (error.body && typeof error.body === 'object') return error.body;
  if (typeof error.error === 'string') return { message: error.error };
  return null;
}

/** Concatenated, lower-cased prose from the error so codes can be matched in it. */
function providerErrorText(error) {
  const body = providerErrorBody(error);
  const inner = body?.error && typeof body.error === 'object' ? body.error : null;
  const parts = [
    error?.message,
    body?.message,
    inner?.message,
    body?.code,
    inner?.code,
    body?.type,
    error?.code,
  ];
  return parts.filter((part) => typeof part === 'string').join(' | ').toLowerCase();
}

function isTimeoutError(error) {
  if (!error || typeof error !== 'object') return false;
  // groq-sdk names its timeout class; undici and fetch bubbles use these.
  const names = [error.name, error.constructor?.name, error.cause?.name];
  if (names.some((name) => typeof name === 'string' && /timeout|timedout/i.test(name))) return true;
  if (error.code === 'ETIMEDOUT' || error.code === 'UND_ERR_CONNECT_TIMEOUT') return true;
  return /timed out|timeout/i.test(providerErrorText(error));
}

/**
 * Does this 429 mean the *daily* allowance is gone?
 *
 * Groq returns the day's token/quota limit as a 429 too, so the status alone
 * cannot tell "slow down for a second" from "nothing works until tomorrow". The
 * daily case is recognised by its code or by the per-day wording in the body;
 * anything else 429 is a normal rate limit.
 */
export function isDailyQuotaError(error) {
  if (!error || typeof error !== 'object') return false;
  const body = providerErrorBody(error);
  const inner = body?.error && typeof body.error === 'object' ? body.error : null;
  const codes = [body?.code, inner?.code, error.code, error.error_code];
  if (codes.some((code) => typeof code === 'string' && /token.*per.*day|per_day|daily|quota_exceeded/i.test(code))) {
    return true;
  }
  const text = providerErrorText(error);
  return /per day|tokens per day|\bTPD\b|daily (token|quota|limit)|quota exceeded/i.test(text);
}

/**
 * Classify a provider failure.
 *
 * Returns one of: `daily-quota`, `rate-limit`, `auth`, `timeout`, `provider`.
 * Order matters: a daily quota is a 429, so it is checked before the status.
 */
export function classifyProviderFailure(error) {
  if (isDailyQuotaError(error)) return 'daily-quota';
  const status = providerErrorStatus(error);
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate-limit';
  if (isTimeoutError(error)) return 'timeout';
  return 'provider';
}

/** Should this failure raise an alert email to the operator? */
export function shouldAlertOnFailure(kind) {
  return ALERTING_FAILURE_KINDS.includes(kind);
}

/**
 * What the learner sees.
 *
 * `workSaved` must be the truth at the moment of the failure, not a guess:
 *
 * - a writing draft that has not been submitted is **not** saved;
 * - a recording held only in the browser is **not** saved (the file never left
 *   the request), so the learner is asked to copy/keep it;
 * - a speech transcript the learner typed in is not saved either.
 *
 * The daily-quota message is used regardless, because the next attempt cannot
 * succeed today and telling them to retry would send them in a circle.
 */
export function learnerFacingProviderError(error, params) {
  const kind = classifyProviderFailure(error);
  const workSaved = Boolean(params?.workSaved);
  const workKind = params?.workKind === 'recording' ? 'recording' : 'text';
  if (kind === 'daily-quota') {
    return { kind, message: PROVIDER_FAILURE_MESSAGES.dailyQuota, code: PROVIDER_FAILURE_CODES.dailyQuota, workSaved };
  }
  if (workSaved) {
    return { kind, message: PROVIDER_FAILURE_MESSAGES.saved, code: PROVIDER_FAILURE_CODES.saved, workSaved: true };
  }
  return workKind === 'recording'
    ? {
        kind,
        message: PROVIDER_FAILURE_MESSAGES.unsavedRecording,
        code: PROVIDER_FAILURE_CODES.unsaved,
        workSaved: false,
      }
    : { kind, message: PROVIDER_FAILURE_MESSAGES.unsaved, code: PROVIDER_FAILURE_CODES.unsaved, workSaved: false };
}

/** HTTP status to send with the learner-facing message. */
export function providerFailureHttpStatus(error) {
  const kind = classifyProviderFailure(error);
  if (kind === 'daily-quota') return 429;
  if (kind === 'rate-limit') return 429;
  // A service that is down is a 503, not the provider's own 401: the learner's
  // session is fine, and a 401 here would make the client look like it had been
  // signed out.
  return 503;
}

/**
 * A one-line description for the server log / alert email.
 *
 * Deliberately includes the provider's message, since the whole point is that
 * the operator can see what actually broke. Never send this to a browser.
 */
export function describeProviderFailure(error, context) {
  const kind = classifyProviderFailure(error);
  const status = providerErrorStatus(error);
  const body = providerErrorBody(error);
  const inner = body?.error && typeof body.error === 'object' ? body.error : null;
  const detail = String(inner?.message ?? body?.message ?? (error instanceof Error ? error.message : error) ?? 'unknown error')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
  const where = [context?.endpoint, context?.model].filter(Boolean).join(' ');
  return `[ai:${kind}]${status ? ` status=${status}` : ''}${where ? ` ${where}` : ''} — ${detail}`;
}

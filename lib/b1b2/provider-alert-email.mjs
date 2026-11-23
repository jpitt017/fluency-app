/**
 * The contents of an AI provider failure alert, with no I/O.
 *
 * Kept apart from `provider-alert.ts` (which is `server-only` because it reads
 * secrets and sends mail) so the wording can be unit-tested. Nothing here may
 * include learner data: no email address, no submitted text, no user id, no
 * request id from a learner's session.
 */

import { classifyProviderFailure, describeProviderFailure, providerErrorStatus } from './provider-errors.mjs';

const TITLES = {
  auth: 'AI key rejected',
  'daily-quota': 'Daily AI quota used up',
  'rate-limit': 'AI rate limit hit',
};

const ADVICE = {
  auth: 'Every learner is affected until GROQ_API_KEY is replaced. Check the key in Vercel and redeploy.',
  'daily-quota':
    'Feedback stops for everyone until the provider quota resets. Consider a paid tier or a different model.',
  'rate-limit': 'Requests are being throttled. Check the provider limits; learners see a retry message.',
};

/** Format a timestamp the way the issue alerts do: Madrid time, medium style. */
function madridTime(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function buildProviderAlert({ endpoint, model, error, occurredAt = new Date() }) {
  const kind = classifyProviderFailure(error);
  const status = providerErrorStatus(error);
  const title = TITLES[kind] ?? 'AI provider failure';
  const subject = `[Fluency] ${title}: ${endpoint}`;
  const text = [
    `${title}.`,
    '',
    `Endpoint: ${endpoint}`,
    `Model: ${model || 'unknown'}`,
    `Kind: ${kind}${status ? ` (HTTP ${status})` : ''}`,
    `Time (Europe/Madrid): ${madridTime(occurredAt)}`,
    '',
    'Provider said:',
    describeProviderFailure(error, { endpoint, model }),
    '',
    ADVICE[kind] ?? 'The provider failed unexpectedly. Check the server logs for this endpoint.',
  ].join('\n');

  return { kind, subject, text };
}

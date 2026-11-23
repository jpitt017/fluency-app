import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
// Type-only: erased at build time, so it adds no runtime import for the bundler
// or the test runner to resolve.
import type { sendProviderFailureAlert as sendAlertType } from './provider-alert';
import {
  learnerFacingProviderError,
  providerFailureHttpStatus,
  describeProviderFailure,
  classifyProviderFailure,
  shouldAlertOnFailure,
} from './provider-errors.mjs';

/**
 * Log the full detail and alert the operator if the fault warrants it.
 *
 * Split out for the one route that recovers from a provider failure instead of
 * returning an error: mediation still saves the attempt, so it has no error
 * response to build, but a dead key must still reach a human.
 *
 * Returns the learner-facing message and kind so callers can decide what to say.
 */
export async function reportProviderFailure(params: {
  admin: SupabaseClient | null;
  endpoint: string;
  model?: string;
  error: unknown;
  workSaved: boolean;
  workKind?: 'text' | 'recording';
  /** Defaults to the real Resend-backed alerter; injected by tests. */
  sendAlert?: typeof sendAlertType;
}) {
  const { admin, endpoint, model = '', error, workSaved, workKind = 'text' } = params;
  // Loaded lazily: the alerter pulls in `server-only` and node:crypto, and tests
  // that inject their own never need either. Extensionless, like every other
  // import here, because Next's bundler resolves it and tsc forbids `.ts`.
  const sendAlert = params.sendAlert ?? (await import('./provider-alert')).sendProviderFailureAlert;
  const kind = classifyProviderFailure(error);
  const errorMessage = describeProviderFailure(error, { endpoint, model });
  console.error(errorMessage);
  await sendAlert({ admin, endpoint, model, error });
  return { kind, errorMessage, learner: learnerFacingProviderError(error, { workSaved, workKind }) };
}

/** True when the fault is one a learner cannot retry away (401/403, 429, daily quota). */
export function isPersistentProviderFailure(error: unknown): boolean {
  return shouldAlertOnFailure(classifyProviderFailure(error));
}

/**
 * Turn a provider failure into (a) a log line, (b) maybe an alert email, and
 * (c) a response a B1 learner can read.
 *
 * Every AI route funnels its catch block through here so the promise holds in
 * one place: **the provider's text never reaches the browser.**
 *
 * `workSaved` is not a guess. Pass true only after the learner's text or
 * recording is in the database or storage. Writing drafts and recordings live
 * only in the request until evaluation succeeds, so they are false — see each
 * call site for the specific reason.
 *
 * Alerting never delays the response beyond its own short timeout, and any
 * failure inside it is swallowed: a learner waiting for feedback must not wait
 * on an email about it.
 *
 * The response builder is injectable so the whole decision — status, body and
 * the absence of any provider text — can be tested without Next's bundler,
 * which is the only thing in this module that needs `next/server`.
 */
export async function providerFailureResponse(params: {
  admin: SupabaseClient | null;
  endpoint: string;
  model?: string;
  error: unknown;
  workSaved: boolean;
  /** 'recording' only where the learner's work is audio, so the copy fits. */
  workKind?: 'text' | 'recording';
  headers?: HeadersInit;
  /** Defaults to `NextResponse.json`; tests pass a plain object builder. */
  json?: (body: Record<string, unknown>, init: { status: number; headers?: HeadersInit }) => unknown;
  /** Defaults to the real alerter; tests pass a stub so no mail is attempted. */
  sendAlert?: typeof sendAlertType;
}): Promise<{ response: Response; kind: string; message: string; errorMessage: string; status: number }> {
  const { admin, endpoint, model = '', error, workSaved, workKind = 'text', headers } = params;

  // The server keeps the full detail; the operator gets an email only for the
  // faults a learner cannot retry their way out of (401/403, 429, daily quota).
  const { kind, errorMessage, learner } = await reportProviderFailure({
    admin,
    endpoint,
    model,
    error,
    workSaved,
    workKind,
    sendAlert: params.sendAlert,
  });

  const body = { error: learner.message, code: learner.code, retryable: kind !== 'daily-quota' };
  const status = providerFailureHttpStatus(error);
  const response = params.json
    ? params.json(body, { status, ...(headers ? { headers } : {}) })
    : // Imported lazily so the module loads under the node test runner too.
      (await import('next/server')).NextResponse.json(body, { status, ...(headers ? { headers } : {}) });

  return {
    response: response as Response,
    status,
    kind,
    message: learner.message,
    errorMessage,
  };
}

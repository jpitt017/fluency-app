import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyProviderFailure, shouldAlertOnFailure } from './provider-errors.mjs';
import { buildProviderAlert } from './provider-alert-email.mjs';
import { alertGroupKey } from './provider-alert-keys.mjs';

/**
 * Alert the operator when an AI provider call fails in a way a learner cannot
 * fix: a bad/revoked key (401/403), a rate limit (429) or the daily token quota.
 *
 * Deliberately separate from `lib/issues/email.ts`, which emails *learner*
 * reports. This one is about the deployment being broken, so it goes out even
 * when nobody clicked anything.
 *
 * Design constraints, in order:
 *
 * 1. **Never block or fail the learner's request.** Everything here is wrapped;
 *    an unreachable Resend must not turn a 503 into a 500.
 * 2. **One email per incident per window.** A broken key fails every request;
 *    without a gate, that is one email per learner per second.
 * 3. **No learner data.** No address, no text, no transcript, no user id. Only
 *    the endpoint, model, status and the provider's own message.
 *
 * The gate is `public.ai_failure_alerts`, keyed by a hash of endpoint + kind so
 * alerts group per endpoint and never reveal a path from a raw key. If the table
 * is missing (migration not yet applied) or the RPC errors, the alert is still
 * attempted once per call: failing open is better than silence, because a
 * misconfigured key means no learner can get feedback at all.
 */

/** Five minutes of grouping keeps a sustained outage to a dozen emails an hour. */
export const ALERT_WINDOW_MINUTES = 10;

// The wording and the grouping key live in a pure module so they can be tested
// without server-only. Re-exported for callers that already import them here.
export { buildProviderAlert } from './provider-alert-email.mjs';

export { alertGroupKey };

/**
 * Returns true when this call actually sent an email. Never throws.
 *
 * `send` is injectable so tests can assert the email without a network call.
 */
export async function sendProviderFailureAlert(params: {
  admin: SupabaseClient | null;
  endpoint: string;
  model?: string;
  error: unknown;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<boolean> {
  const { admin, endpoint, model = '', error } = params;
  try {
    const kind = classifyProviderFailure(error);
    if (!shouldAlertOnFailure(kind)) return false;

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.ISSUE_EMAIL_FROM;
    const to = process.env.ISSUE_ADMIN_EMAIL;
    const base = process.env.ISSUE_APP_URL;
    if (!apiKey || !from || !to || !base) {
      // Missing mail settings must not hide the fault: the log line still names it.
      console.error('[ai-alert] Email settings missing; provider failure not emailed:', kind, endpoint);
      return false;
    }

    const groupKey = alertGroupKey(endpoint, kind);
    let claimed = true;
    if (admin) {
      try {
        const { data, error: claimError } = await admin.rpc('claim_ai_failure_alert', {
          p_group_key: groupKey,
          p_window_minutes: ALERT_WINDOW_MINUTES,
        });
        if (claimError) {
          // Missing table is the expected case before the migration lands.
          console.error('[ai-alert] Could not claim alert window:', claimError.message);
        } else if (data === false) {
          claimed = false;
        }
      } catch (claimFailure) {
        console.error('[ai-alert] Alert window check failed:', claimFailure);
      }
    }
    if (!claimed) return false;

    const { subject, text } = buildProviderAlert({ endpoint, model, error });
    const fetchImpl = params.fetchImpl ?? fetch;
    const response = await fetchImpl('https://api.resend.com/emails', {
      signal: AbortSignal.timeout(5000),
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Same incident within the window is already suppressed above; this keeps
        // a retried request from sending twice.
        'Idempotency-Key': `ai-failure/${groupKey}/${Math.floor((params.now?.() ?? Date.now()) / (ALERT_WINDOW_MINUTES * 60000))}`,
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!response.ok) {
      console.error('[ai-alert] Provider alert delivery failed:', response.status);
      return false;
    }
    return true;
  } catch (failure) {
    console.error('[ai-alert] Provider alert failed:', failure);
    return false;
  }
}

/**
 * Which Supabase project a pipeline run is allowed to touch.
 *
 * Rule: a week may never be marked `released` on the production project, not
 * even for a moment while testing. Approving a track is a decision about what
 * learners hear, so it only ever happens as a deliberate, human-reviewed step —
 * and the project that serves learners is the one place a mistake is visible.
 *
 * Every other operation (generate, upload unreleased, delete, list, review) is
 * safe to rehearse against production because it leaves learners on "Audio
 * coming soon." Release and revoke are the two that change that, so they are the
 * two that must run somewhere else: a preview/branch database, or locally
 * against a development project.
 *
 * The check reads the Supabase URL the process was given (`NEXT_PUBLIC_SUPABASE_URL`
 * or `SUPABASE_URL`) and compares its project ref against the configured
 * production ref. It fails closed: with release/revoke modes, an unknown or
 * missing URL is refused rather than guessed at.
 */

/** Project ref that serves learners. `https://<ref>.supabase.co`. */
export const PRODUCTION_PROJECT_REF = 'ebzmkhrssgnzmixfsuso';

/** Set to `1`/`true` only in CI/local shells that are allowed to approve tracks. */
export const ALLOW_PROD_RELEASE_ENV = 'ALLOW_PRODUCTION_RELEASE';

/** Modes that write the approval flag, i.e. change what a learner can hear. */
export const APPROVAL_MODES = ['release', 'revoke', 'speaking-release', 'speaking-revoke'];

/**
 * Pulls the project ref out of a Supabase URL: `<ref>.supabase.co`, or the
 * local stack's `http://127.0.0.1:54321`. Returns null when there is nothing
 * recognisable to compare, so callers can fail closed.
 */
export function projectRefFromUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  let host;
  try {
    host = new URL(trimmed).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host) return null;
  const match = /^([a-z0-9-]+)\.supabase\.(co|in)$/.exec(host);
  if (match) return match[1];
  // A local Supabase stack is not production by definition.
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return 'local';
  return null;
}

export function isProductionUrl(url, productionRef = PRODUCTION_PROJECT_REF) {
  return projectRefFromUrl(url) === productionRef;
}

export function isApprovalBypassRequested(env = process.env) {
  const raw = env[ALLOW_PROD_RELEASE_ENV];
  return raw === '1' || raw === 'true';
}

/**
 * Decides whether an approval write may proceed against `url`.
 *
 * Returns `{ ok: true }` or `{ ok: false, reason }` with a message written to
 * be printed as-is. Unknown URLs are refused: a typo must not silently approve
 * a track on whatever project it happens to reach.
 */
export function checkApprovalTarget({
  url,
  productionRef = PRODUCTION_PROJECT_REF,
  bypass = false,
} = {}) {
  const ref = projectRefFromUrl(url);
  if (!ref) {
    return {
      ok: false,
      reason:
        'Refusing to change approval state: NEXT_PUBLIC_SUPABASE_URL is missing or is not a Supabase URL. ' +
        'Release and revoke must run against a preview or development project, never an unknown one.',
    };
  }
  if (ref !== productionRef) return { ok: true, ref };
  if (bypass) return { ok: true, ref, production: true };
  return {
    ok: false,
    ref,
    production: true,
    reason:
      `Refusing to change approval state on production (project ${productionRef}). ` +
      'A week may never be marked released on production, not even briefly for a test: ' +
      'learners would hear the track and the page would change. ' +
      'Use unit tests, a preview/branch database, or a fake week number learners cannot open. ' +
      `If this really is a deliberate, reviewed release, re-run with ${ALLOW_PROD_RELEASE_ENV}=1.`,
  };
}

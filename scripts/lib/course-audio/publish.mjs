/**
 * Uploads a generated listening track into the public `course-audio` bucket and
 * records its approval state in `listening_audio_trials`.
 *
 * Nothing here releases a track to learners: every upload lands unreleased with
 * `audio_url` empty. `--release` is a separate, deliberate step in
 * scripts/generate-course-audio.mjs. The path rules for deletion live in
 * ./delete-guard.mjs and are enforced here, not only in the CLI.
 */

import {
  AUDIO_BUCKET,
  TRIAL_PREFIX,
  assertDeletableKeys,
  assertTrialTrackKey,
  assertTrialWeek,
  isTrialFileName,
  trialObjectKeys,
} from './delete-guard.mjs';
import { checkApprovalTarget, isApprovalBypassRequested } from './environment.mjs';

export { AUDIO_BUCKET, TRIAL_PREFIX, trialObjectKeys };

/**
 * Removes a week's files from the public bucket.
 *
 * Deleting through the Storage API is what removes the object, its metadata row
 * and the bytes; the bucket is public, so a trial that will not be used must not
 * be left sitting there. The week and every key are checked against
 * ./delete-guard.mjs before the call, so this cannot be pointed outside
 * `weeks-01-04/ai-trial/` even if a caller passes a crafted value. Returns the
 * keys Storage confirmed as removed, and throws if anything it reported back is
 * still listed.
 */
export async function deleteTrialFiles(client, week) {
  const keys = assertDeletableKeys(trialObjectKeys(week)).map(assertTrialTrackKey);
  const { data, error } = await client.storage.from(AUDIO_BUCKET).remove(keys);
  if (error) throw new Error(`Could not delete week ${week} from ${AUDIO_BUCKET}: ${JSON.stringify(error)}`);
  const removed = new Set((data ?? []).map((item) => item.name ?? item.path ?? ''));
  const missing = keys.filter((key) => !removed.has(key));
  if (missing.length === keys.length) {
    // Nothing was reported back. Treat that as "already gone" only if a listing
    // confirms it, so a silent failure cannot pass as a deletion.
    const stillThere = await listTrialFiles(client, week);
    if (stillThere.length) {
      throw new Error(`Storage did not delete ${stillThere.join(', ')}`);
    }
    return [];
  }
  if (missing.length) throw new Error(`Storage did not delete ${missing.join(', ')}`);
  return keys;
}

/** Confirms what is actually left in the bucket for a week. */
export async function listTrialFiles(client, week) {
  assertTrialWeek(week);
  const { data, error } = await client.storage.from(AUDIO_BUCKET).list(TRIAL_PREFIX.replace(/\/$/, ''), {
    limit: 100,
  });
  if (error) throw new Error(`Could not list ${AUDIO_BUCKET}: ${JSON.stringify(error)}`);
  const prefix = `week-${week}-listening`;
  return (data ?? [])
    .map((item) => item.name)
    .filter((name) => isTrialFileName(name) && name.startsWith(prefix));
}

export async function uploadToBucket(client, target) {
  const bucket = target.bucket ?? AUDIO_BUCKET;
  if (bucket === AUDIO_BUCKET) assertTrialTrackKey(target.key);
  const { error } = await client.storage.from(bucket).upload(target.key, target.body, {
    contentType: target.contentType,
    upsert: true,
  });
  if (error) throw new Error(`Upload of ${bucket}/${target.key} failed: ${JSON.stringify(error)}`);
  const { data } = client.storage.from(bucket).getPublicUrl(target.key);
  if (!data?.publicUrl) throw new Error(`Could not resolve a public URL for ${bucket}/${target.key}`);
  return data.publicUrl;
}

/**
 * Writes the unreleased trial row. Deliberately does not set `audio_url` or
 * `released`: the audio file exists in storage, but learners cannot reach it
 * until a person approves the track with `--release`.
 */
export async function recordUnreleasedTrial(record) {
  const { error } = await record.client
    .from('listening_audio_trials')
    .upsert(
      {
        week: record.week,
        audio_url: null,
        captions_url: record.captionsUrl,
        source: 'ai-trial',
        released: false,
        model: record.model,
        voices: record.voices,
        duration_seconds: record.durationSeconds,
        caption_cues: record.captionCues,
        generated_at: record.generatedAt,
      },
      { onConflict: 'week' },
    );
  if (error) throw new Error(`Could not record the trial row for week ${record.week}: ${JSON.stringify(error)}`);
}

/**
 * Resolves the project URL an injected client talks to.
 *
 * `created.supabaseUrl` is not part of the public type, so it is read
 * defensively; `options.url` overrides it, and the environment is the last
 * resort. Returning undefined is fine — the guard treats "unknown URL" as a
 * refusal for approval writes.
 */
export function clientProjectUrl(client, explicitUrl) {
  if (explicitUrl) return explicitUrl;
  const fromClient = client?.supabaseUrl;
  if (typeof fromClient === 'string' && fromClient) return fromClient;
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
}

/**
 * Approval: the only code path that makes a track playable for learners.
 *
 * Refuses production unless `allowProductionRelease` is set. That is the
 * standing rule — a week is never marked released on production, not even
 * briefly for a test — enforced here so no caller can bypass it by accident.
 * `productionRef`, `url` and `bypass` exist so the rule itself can be tested
 * against a fake client without touching a project.
 */
export async function releaseTrial(options) {
  const verdict = checkApprovalTarget({
    url: clientProjectUrl(options.client, options.url),
    productionRef: options.productionRef,
    bypass: options.allowProductionRelease ?? isApprovalBypassRequested(),
  });
  if (!verdict.ok) throw new Error(verdict.reason);
  const { error } = await options.client
    .from('listening_audio_trials')
    .update({
      audio_url: options.audioUrl,
      captions_url: options.captionsUrl,
      released: true,
      released_at: options.releasedAt ?? new Date().toISOString(),
    })
    .eq('week', options.week);
  if (error) throw new Error(`Could not release week ${options.week}: ${JSON.stringify(error)}`);
}

/**
 * Un-approving a track also writes the learner-facing switch, so it carries the
 * same production guard as `releaseTrial`. Its purpose is to catch a mistake -
 * hiding a live track on production is worth as much care as publishing one.
 */
export async function revokeTrial(options) {
  const verdict = checkApprovalTarget({
    url: clientProjectUrl(options.client, options.url),
    productionRef: options.productionRef,
    bypass: options.allowProductionRelease ?? isApprovalBypassRequested(),
  });
  if (!verdict.ok) throw new Error(verdict.reason);
  const { error } = await options.client
    .from('listening_audio_trials')
    .update({ released: false, audio_url: null, released_at: null })
    .eq('week', options.week);
  if (error) throw new Error(`Could not revoke week ${options.week}: ${JSON.stringify(error)}`);
}

/**
 * Time-limited link so a reviewer can listen before approval.
 *
 * The bucket is public, so this is convenience rather than access control: what
 * keeps an unapproved track away from learners is the `released` flag, because
 * the app never renders a URL while the row is unreleased. Keep review links
 * out of shared documents, and use `--revoke` to hide a replaced recording.
 */
export async function signReviewUrl(client, key, expiresInSeconds) {
  const { data, error } = await client.storage.from(AUDIO_BUCKET).createSignedUrl(key, expiresInSeconds);
  if (error || !data?.signedUrl) throw new Error(`Could not sign ${key}: ${JSON.stringify(error)}`);
  return data.signedUrl;
}

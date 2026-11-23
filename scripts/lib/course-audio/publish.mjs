/**
 * Storage and approval state for the Weeks 1–4 listening tracks.
 *
 * Two buckets, two jobs:
 *
 *   course-audio-review   private. Every generated track lands here first, with
 *                         no public URL and no storage policy, so an unapproved
 *                         recording cannot be reached by guessing a path.
 *                         Review links are 1-hour signed URLs.
 *   course-audio          public. Only `release` copies a track here, and only
 *                         then does `listening_audio_trials.audio_url` point at
 *                         it. `revoke` clears the URL again.
 *
 * Nothing here releases a track by itself: every upload records the row as
 * unreleased. The path rules for deletion live in ./delete-guard.mjs and are
 * enforced here, not only in the CLI.
 */

import {
  AUDIO_BUCKET,
  DEFAULT_REVIEW_BUCKET,
  PROBE_OBJECTS,
  TRIAL_PREFIX,
  assertDeletableKeys,
  assertProbeObject,
  assertReviewKey,
  assertTrialTrackKey,
  assertTrialWeek,
  isTrialFileName,
  reviewObjectKeys,
  trialObjectKeys,
} from './delete-guard.mjs';
import { checkApprovalTarget, isApprovalBypassRequested } from './environment.mjs';

export { AUDIO_BUCKET, DEFAULT_REVIEW_BUCKET, TRIAL_PREFIX, trialObjectKeys, reviewObjectKeys };

/** Review links expire after an hour: long enough for one review pass. */
export const REVIEW_LINK_SECONDS = 60 * 60;

/** Uploads are retried this many times, for the storage 5xx blips. */
const UPLOAD_ATTEMPTS = 4;

/**
 * Storage reports a transient failure as a 5xx, or as the literal status 520
 * (Cloudflare "unknown error") with an empty message. A 4xx is a real problem:
 * wrong bucket, wrong mime type, missing permission.
 */
function isTransientStorageError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  return status >= 500 || status === 0;
}

/**
 * Keys of the per-speaker voice-check files written by `--voice-check`.
 * They live next to the tracks, so the same delete rules cover them.
 */
export function voiceCheckKeys(speaker) {
  const safe = String(speaker).replace(/[^A-Za-z]/g, '');
  if (!safe) throw new Error(`Refusing a voice check for "${speaker}": the name is not a speaker name`);
  return [`${TRIAL_PREFIX}voice-check-${safe}.mp3`];
}

/* ------------------------------------------------------------------ *
 * Deletion
 * ------------------------------------------------------------------ */

/**
 * Removes a week's files from the review bucket.
 *
 * The week and every key are checked against ./delete-guard.mjs before the call,
 * so this cannot be pointed outside `weeks-01-04/ai-trial/` even if a caller
 * passes a crafted value. Returns the keys Storage confirmed as removed, and
 * throws if anything it reported back is still listed.
 */
export async function deleteReviewFiles(client, week, bucket = DEFAULT_REVIEW_BUCKET) {
  const keys = assertDeletableKeys(reviewObjectKeys(week), bucket);
  const { data, error } = await client.storage.from(bucket).remove(keys);
  if (error) throw new Error(`Could not delete week ${week} from ${bucket}: ${JSON.stringify(error)}`);
  const removed = new Set((data ?? []).map((item) => item.name ?? item.path ?? ''));
  const missing = keys.filter((key) => !removed.has(key));
  if (missing.length === keys.length) {
    // Nothing was reported back. Treat that as "already gone" only if a listing
    // confirms it, so a silent failure cannot pass as a deletion.
    const stillThere = await listReviewFiles(client, week, bucket);
    if (stillThere.length) {
      throw new Error(`Storage did not delete ${stillThere.join(', ')}`);
    }
    return [];
  }
  if (missing.length) throw new Error(`Storage did not delete ${missing.join(', ')}`);
  return keys;
}

/**
 * Removes a released week's public copies from `course-audio`, so a revoke can
 * take the audio off the public bucket instead of leaving it lying there.
 */
export async function deleteReleasedFiles(client, week) {
  const keys = assertDeletableKeys(trialObjectKeys(week), AUDIO_BUCKET);
  const { data, error } = await client.storage.from(AUDIO_BUCKET).remove(keys);
  if (error) throw new Error(`Could not delete week ${week} from ${AUDIO_BUCKET}: ${JSON.stringify(error)}`);
  return (data ?? []).map((item) => item.name ?? item.path ?? '');
}

/**
 * Removes the probe objects left by the 2026-11-22 storage check.
 *
 * A probe is not a track and not an audition clip: it is a 400 kB MP3 and two
 * 6-byte text files that were only ever there to prove a bucket accepted an
 * upload. They are deleted by exact (bucket, key) through the Storage API, one
 * entry at a time, and each is only attempted if a listing shows it is there.
 * Nothing else can be named by this function.
 */
export async function deleteProbeObjects(client, log = () => {}) {
  const removed = [];
  const missing = [];
  for (const entry of PROBE_OBJECTS) {
    assertProbeObject(entry.bucket, entry.key);
    const folder = entry.key.split('/').slice(0, -1).join('/');
    const name = entry.key.split('/').pop();
    const { data, error } = await client.storage.from(entry.bucket).list(folder, { limit: 100 });
    if (error) throw new Error(`Could not list ${entry.bucket}: ${JSON.stringify(error)}`);
    const present = (data ?? []).some((item) => item.name === name);
    if (!present) {
      missing.push(entry);
      log(`  already gone: ${entry.bucket}/${entry.key}`);
      continue;
    }
    const { data: deleted, error: deleteError } = await client.storage.from(entry.bucket).remove([entry.key]);
    if (deleteError) {
      throw new Error(`Could not delete ${entry.bucket}/${entry.key}: ${JSON.stringify(deleteError)}`);
    }
    const confirmed = (deleted ?? []).some((item) => (item.name ?? item.path) === entry.key);
    if (!confirmed) throw new Error(`Storage did not delete ${entry.bucket}/${entry.key}`);
    removed.push(entry);
    log(`  deleted: ${entry.bucket}/${entry.key} (${name})`);
  }
  return { removed, missing, checked: PROBE_OBJECTS.length };
}

/** Confirms what is actually left in the review bucket for a week. */
export async function listReviewFiles(client, week, bucket = DEFAULT_REVIEW_BUCKET) {
  assertTrialWeek(week);
  const { data, error } = await client.storage.from(bucket).list(TRIAL_PREFIX.replace(/\/$/, ''), {
    limit: 100,
  });
  if (error) throw new Error(`Could not list ${bucket}: ${JSON.stringify(error)}`);
  const prefix = `week-${week}-listening`;
  return (data ?? [])
    .map((item) => item.name)
    .filter((name) => isTrialFileName(name) && name.startsWith(prefix));
}

/* ------------------------------------------------------------------ *
 * Uploads
 * ------------------------------------------------------------------ */

/**
 * Uploads one object, retrying the transient failures Storage occasionally
 * returns for a large binary upload (a bare 520 with no message: the request is
 * worth repeating, a permission error is not).
 *
 * The review bucket is private, so the returned value is only a key to sign
 * later; the public bucket returns the URL a learner hears.
 */
export async function uploadToBucket(client, target) {
  const bucket = target.bucket ?? AUDIO_BUCKET;
  if (bucket === AUDIO_BUCKET) assertTrialTrackKey(target.key, bucket);
  else assertReviewKey(target.key, bucket);
  let lastError = null;
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt += 1) {
    const { error } = await client.storage.from(bucket).upload(target.key, target.body, {
      contentType: target.contentType,
      upsert: true,
    });
    if (!error) {
      lastError = null;
      break;
    }
    lastError = error;
    if (!isTransientStorageError(error) || attempt === UPLOAD_ATTEMPTS) break;
    await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
  }
  if (lastError) {
    throw new Error(`Upload of ${bucket}/${target.key} failed: ${JSON.stringify(lastError)}`);
  }
  if (bucket !== AUDIO_BUCKET) return null;
  const { data } = client.storage.from(bucket).getPublicUrl(target.key);
  if (!data?.publicUrl) throw new Error(`Could not resolve a public URL for ${bucket}/${target.key}`);
  return data.publicUrl;
}

/**
 * Writes the unreleased trial row. Deliberately does not set `audio_url` or
 * `released`: the audio exists in the private review bucket, but learners cannot
 * reach it until a person approves the track with `--release`.
 */
export async function recordUnreleasedTrial(record) {
  const { error } = await record.client
    .from('listening_audio_trials')
    .upsert(
      {
        week: record.week,
        audio_url: null,
        captions_url: null,
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
 * Copies a reviewed track from the private review bucket into the public bucket.
 * This is the step that puts bytes where learners could fetch them, so it is
 * only reached from `--release`, after the production guard below.
 *
 * @returns {Promise<{audioUrl: string, captionsUrl: string|null}>}
 */
export async function publishToPublicBucket(client, week, files) {
  const keys = assertDeletableKeys(trialObjectKeys(week), AUDIO_BUCKET);
  const audioUrl = await uploadToBucket(client, {
    bucket: AUDIO_BUCKET,
    key: keys[0],
    contentType: 'audio/mpeg',
    body: files.audio,
  });
  let captionsUrl = null;
  if (files.captions) {
    captionsUrl = await uploadToBucket(client, {
      bucket: AUDIO_BUCKET,
      key: keys[1],
      contentType: 'text/vtt',
      body: files.captions,
    });
  }
  return { audioUrl, captionsUrl };
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
      captions_url: options.captionsUrl ?? null,
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
 * The bucket is private (no policies), and the pipeline holds the service-role
 * key, so the signature is the only way in. Links expire after an hour; use
 * `--revoke` to hide a replaced recording from learners.
 */
export async function signReviewUrl(client, key, expiresInSeconds = REVIEW_LINK_SECONDS) {
  assertReviewKey(key, DEFAULT_REVIEW_BUCKET);
  const { data, error } = await client.storage
    .from(DEFAULT_REVIEW_BUCKET)
    .createSignedUrl(key, expiresInSeconds);
  if (error || !data?.signedUrl) throw new Error(`Could not sign ${key}: ${JSON.stringify(error)}`);
  return data.signedUrl;
}

/** Reads a track back out of the review bucket, for release and for the checks. */
export async function downloadFromReview(client, key, bucket = DEFAULT_REVIEW_BUCKET) {
  assertReviewKey(key, bucket);
  const { data, error } = await client.storage.from(bucket).download(key);
  if (error || !data) throw new Error(`Could not download ${bucket}/${key}: ${JSON.stringify(error)}`);
  return Buffer.from(await data.arrayBuffer());
}


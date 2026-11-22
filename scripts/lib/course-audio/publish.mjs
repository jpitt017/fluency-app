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
  TRIAL_PREFIX,
  assertDeletableKeys,
  assertReviewKey,
  assertTrialTrackKey,
  assertTrialWeek,
  isTrialFileName,
  reviewObjectKeys,
  trialObjectKeys,
} from './delete-guard.mjs';

export { AUDIO_BUCKET, DEFAULT_REVIEW_BUCKET, TRIAL_PREFIX, trialObjectKeys, reviewObjectKeys };

/** Review links expire after an hour: long enough for one review pass. */
export const REVIEW_LINK_SECONDS = 60 * 60;

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
 * Uploads one object. The review bucket is private, so the returned value is
 * only a key to sign later; the public bucket returns the URL a learner hears.
 */
export async function uploadToBucket(client, target) {
  const bucket = target.bucket ?? AUDIO_BUCKET;
  if (bucket === AUDIO_BUCKET) assertTrialTrackKey(target.key, bucket);
  else assertReviewKey(target.key, bucket);
  const { error } = await client.storage.from(bucket).upload(target.key, target.body, {
    contentType: target.contentType,
    upsert: true,
  });
  if (error) throw new Error(`Upload of ${bucket}/${target.key} failed: ${JSON.stringify(error)}`);
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
 * Copies a reviewed track from the private review bucket into the public bucket
 * and records the public URLs. This is the only path that makes a track
 * playable, and it is a deliberate CLI step (`--release`).
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

/** Approval: the only code path that makes a track playable for learners. */
export async function releaseTrial(options) {
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


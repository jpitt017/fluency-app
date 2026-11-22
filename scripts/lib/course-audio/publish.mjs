/**
 * Uploads a generated listening track into the public `course-audio` bucket and
 * records its approval state in `listening_audio_trials`.
 *
 * Nothing here releases a track to learners: every upload lands unreleased with
 * `audio_url` empty. `--release` is a separate, deliberate step in
 * scripts/generate-course-audio.mjs.
 */

export const AUDIO_BUCKET = 'course-audio';

/** Everything the pipeline writes for one week. */
export function trialObjectKeys(week) {
  return [
    `weeks-01-04/ai-trial/week-${week}-listening.mp3`,
    `weeks-01-04/ai-trial/week-${week}-listening.vtt`,
  ];
}

/**
 * Removes a week's files from the public bucket.
 *
 * Deleting through the Storage API is what removes the object, its metadata row
 * and the bytes; the bucket is public, so an unreleased track must not be left
 * sitting there. Returns the keys Storage confirmed as removed, and throws if
 * anything it reported back is still listed.
 */
export async function deleteTrialFiles(client, week) {
  const keys = trialObjectKeys(week);
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
  const { data, error } = await client.storage.from(AUDIO_BUCKET).list('weeks-01-04/ai-trial', { limit: 100 });
  if (error) throw new Error(`Could not list ${AUDIO_BUCKET}: ${JSON.stringify(error)}`);
  const prefix = `week-${week}-listening`;
  return (data ?? []).map((item) => item.name).filter((name) => name.startsWith(prefix));
}

export async function uploadToBucket(client, target) {
  const bucket = target.bucket ?? AUDIO_BUCKET;
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

/** Approval: the only code path that makes a track playable for learners. */
export async function releaseTrial(options) {
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

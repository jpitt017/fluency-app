/**
 * Safety rules for the `delete` mode of scripts/generate-course-audio.mjs.
 *
 * Deleting audio is the one irreversible thing this pipeline does, so the rules
 * live in one testable module instead of inside CLI glue:
 *
 * 1. Buckets: only `course-audio-review` (private, the working copy) and
 *    `course-audio` (public, released copies) are ever touched. A bucket name
 *    from a caller is checked against that list, not interpolated.
 * 2. Paths: an object may only be deleted from
 *    `<bucket>/weeks-01-04/ai-trial/`. Anything else is refused, including
 *    traversal (`..`), absolute paths, backslashes, NUL bytes, empty segments
 *    and percent-encoded separators. Weeks are whole numbers.
 * 3. Dry run: a delete never touches Storage unless `confirm: true` is passed.
 *    Anything other than the literal `true`/`'true'` counts as not confirmed.
 * 4. Released weeks: a week that is live for learners is never deleted. Revoke
 *    it first, so the files cannot vanish underneath a live page.
 */

export const AUDIO_BUCKET = 'course-audio';
export const DEFAULT_REVIEW_BUCKET = 'course-audio-review';
/** Both buckets keep the same key layout, so release is a straight copy. */
export const TRIAL_PREFIX = 'weeks-01-04/ai-trial/';
/** The only weeks this pipeline generates. */
export const TRIAL_WEEKS = [1, 2, 3, 4];

export const ALLOWED_BUCKETS = [DEFAULT_REVIEW_BUCKET, AUDIO_BUCKET];

/**
 * Listening auditions: a voice check or a Week 3 sample. They exist to be
 * listened to before a listening track is recorded, so they are private-only
 * and never named by an approval row. Speaking review clips have their own
 * explicit allow-list below.
 */
export const AUDITION_CLIP_NAMES = [
  'tom-two-lines.mp3',
  'marta-three-turns.mp3',
  'ellie-longest.mp3',
  'joanne-opening.mp3',
  'week-3-sample-Dan.mp3',
  'week-3-sample-Marta.mp3',
];

/**
 * The three probe objects from the 2026-11-22 storage check, by exact name. They
 * are not audio and not pipeline output, so they are deleted through the Storage
 * API by name rather than through any pattern: the list is the whole permission.
 */
export const PROBE_OBJECTS = [
  { bucket: DEFAULT_REVIEW_BUCKET, key: `${TRIAL_PREFIX}probe-big.mp3` },
  { bucket: DEFAULT_REVIEW_BUCKET, key: `${TRIAL_PREFIX}probe-course-audio-review.txt` },
  { bucket: AUDIO_BUCKET, key: `${TRIAL_PREFIX}probe-course-audio.txt` },
];

/** Accepts only an exact probe entry: same bucket, same key, nothing else. */
export function assertProbeObject(bucket, key) {
  const match = PROBE_OBJECTS.find((item) => item.bucket === bucket && item.key === key);
  if (!match) throw new Error(`Refusing "${bucket}/${key}": it is not one of the probe objects`);
  return match;
}

/**
 * A file name under the prefix: starts with an alphanumeric, then letters,
 * digits, `_` or `-`, with at most one short extension. No leading dot, no `..`,
 * no slashes, no spaces.
 */
const ALLOWED_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9]{1,5})?$/;

export function assertKnownBucket(bucket) {
  if (!ALLOWED_BUCKETS.includes(bucket)) {
    throw new Error(`Refusing bucket "${String(bucket)}": only ${ALLOWED_BUCKETS.join(', ')} are used by this pipeline`);
  }
  return bucket;
}

export function assertTrialWeek(week) {
  if (typeof week !== 'number' || !Number.isInteger(week)) {
    throw new Error(`Refusing week "${String(week)}": the week must be a whole number`);
  }
  if (!TRIAL_WEEKS.includes(week)) {
    throw new Error(`Refusing week ${week}: only Weeks ${TRIAL_WEEKS.join(', ')} have trial tracks`);
  }
  return week;
}

/** Everything the pipeline writes for one week, inside the trial prefix. */
export function trialObjectKeys(week) {
  assertTrialWeek(week);
  return [`${TRIAL_PREFIX}week-${week}-listening.mp3`, `${TRIAL_PREFIX}week-${week}-listening.vtt`];
}

/** The review copy has the same layout as the released copy. */
export function reviewObjectKeys(week) {
  return trialObjectKeys(week);
}

/**
 * Accepts an object key only when it is a plain name inside the trial prefix.
 * Returns the key, or throws with the reason.
 */
export function assertTrialObjectKey(key, bucket = DEFAULT_REVIEW_BUCKET) {
  assertKnownBucket(bucket);
  if (typeof key !== 'string' || !key) throw new Error('Refusing to delete an empty object key');
  if (key.includes('\\')) throw new Error(`Refusing "${key}": backslashes are not allowed`);
  if (key.includes('\0')) throw new Error(`Refusing "${key}": NUL bytes are not allowed`);
  if (/%(2e|2f|5c)/i.test(key)) throw new Error(`Refusing "${key}": percent-encoded separators are not allowed`);
  if (key.startsWith('/')) throw new Error(`Refusing "${key}": absolute paths are not allowed`);
  if (!key.startsWith(TRIAL_PREFIX)) {
    throw new Error(`Refusing "${key}": only ${bucket}/${TRIAL_PREFIX} may be deleted`);
  }
  const name = key.slice(TRIAL_PREFIX.length);
  if (name.includes('..')) throw new Error(`Refusing "${key}": ".." is not allowed`);
  if (name.includes('/')) throw new Error(`Refusing "${key}": nested paths are not allowed`);
  const segments = key.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`Refusing "${key}": empty or relative path segments are not allowed`);
  }
  if (!ALLOWED_NAME.test(name)) {
    throw new Error(`Refusing "${key}": "${name}" is not a trial file name`);
  }
  return key;
}

/** Refuses every key unless all of them are inside the trial prefix. */
export function assertDeletableKeys(keys, bucket = DEFAULT_REVIEW_BUCKET) {
  if (!Array.isArray(keys) || keys.length === 0) throw new Error('Refusing to delete nothing');
  return keys.map((key) => assertTrialObjectKey(key, bucket));
}

/**
 * The only files a week may own inside the prefix: its MP3 and its WebVTT.
 * Anything else is refused even if the name is otherwise well formed.
 */
export function assertTrialTrackKey(key, bucket = AUDIO_BUCKET) {
  assertTrialObjectKey(key, bucket);
  const allowed = TRIAL_WEEKS.flatMap((week) => [`week-${week}-listening.mp3`, `week-${week}-listening.vtt`]);
  if (!allowed.includes(key.slice(TRIAL_PREFIX.length))) {
    throw new Error(`Refusing "${key}": it is not one of the trial track files (${allowed.length} allowed)`);
  }
  return key;
}

/** Exact Week 1–4 speaking model/chunk paths, valid only in course audio buckets. */
export function assertSpeakingTrackKey(key, bucket = DEFAULT_REVIEW_BUCKET) {
  assertTrialObjectKey(key, bucket);
  const name = key.slice(TRIAL_PREFIX.length);
  if (!/^speaking-week-[1-4]-(?:model|shadowing-[1-3])\.mp3$/.test(name)) {
    throw new Error(`Refusing "${key}": it is not an authored Week 1–4 speaking clip`);
  }
  return key;
}

/**
 * Anything the pipeline uploads to, or signs from, the review bucket: listening
 * track files, audition clips, and the exact Week 1–4 speaking model/chunk keys.
 * Listening samples remain audition-only and are never released.
 */
export function assertReviewKey(key, bucket = DEFAULT_REVIEW_BUCKET) {
  assertTrialObjectKey(key, bucket);
  const name = key.slice(TRIAL_PREFIX.length);
  // Audition clips only exist in the private review bucket: a voice check or a
  // sample is never a learner-facing file.
  const audition = /^voice-check-[A-Za-z]+\.mp3$/.test(name) || AUDITION_CLIP_NAMES.includes(name);
  if (audition) {
    if (bucket !== DEFAULT_REVIEW_BUCKET) {
      throw new Error(`Refusing "${key}": audition clips only live in ${DEFAULT_REVIEW_BUCKET}`);
    }
    return key;
  }
  if (/^speaking-week-[1-4]-(?:model|shadowing-[1-3])\.mp3$/.test(name)) {
    if (bucket !== DEFAULT_REVIEW_BUCKET) {
      throw new Error(`Refusing "${key}": speaking review clips only live in ${DEFAULT_REVIEW_BUCKET}`);
    }
    return assertSpeakingTrackKey(key, bucket);
  }
  return assertTrialTrackKey(key, bucket);
}

/** Storage listing names are bare file names, so confine them the same way. */
export function isTrialFileName(name) {
  return typeof name === 'string' && !name.includes('..') && !name.includes('/') && ALLOWED_NAME.test(name);
}

/** Only an explicit, literal confirmation arms the delete. */
export function isConfirmed(value) {
  return value === true || value === 'true';
}

export function assertNotReleased(week, released) {
  if (released !== false && released !== undefined && released !== null) {
    throw new Error(
      `Refusing to delete week ${week}: it is released for learners. Revoke it first, then delete.`,
    );
  }
  return week;
}

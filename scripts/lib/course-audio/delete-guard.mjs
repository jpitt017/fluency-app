/**
 * Safety rules for the `delete` mode of scripts/generate-course-audio.mjs.
 *
 * Deleting from a public bucket is the one irreversible thing this pipeline
 * does, so the rules live in one testable module instead of inside CLI glue:
 *
 * 1. Paths: an object may only be deleted from
 *    `course-audio/weeks-01-04/ai-trial/`. Anything else is refused, including
 *    traversal (`..`), absolute paths, backslashes, NUL bytes, empty segments
 *    and percent-encoded separators. Weeks are whole numbers.
 * 2. Dry run: a delete never touches Storage unless `confirm: true` is passed.
 *    Anything other than the literal `true`/`'true'` counts as not confirmed.
 * 3. Released weeks: a week that is live for learners is never deleted. Revoke
 *    it first, so the files cannot vanish underneath a live page.
 */

export const AUDIO_BUCKET = 'course-audio';
export const TRIAL_PREFIX = 'weeks-01-04/ai-trial/';
/** The only weeks this pipeline generates. */
export const TRIAL_WEEKS = [1, 2, 3, 4];
/**
 * A file name under the prefix: starts with an alphanumeric, then letters,
 * digits, `_` or `-`, with at most one short extension. No leading dot, no `..`,
 * no slashes, no spaces.
 */
const ALLOWED_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9]{1,5})?$/;

export function assertTrialWeek(week) {
  if (typeof week !== 'number' || !Number.isInteger(week)) {
    throw new Error(`Refusing week "${String(week)}": the week must be a whole number`);
  }
  if (!TRIAL_WEEKS.includes(week)) {
    throw new Error(
      `Refusing week ${week}: only Weeks ${TRIAL_WEEKS.join(', ')} have trial tracks`,
    );
  }
  return week;
}

/** Everything the pipeline writes for one week, inside the trial prefix. */
export function trialObjectKeys(week) {
  assertTrialWeek(week);
  return [`${TRIAL_PREFIX}week-${week}-listening.mp3`, `${TRIAL_PREFIX}week-${week}-listening.vtt`];
}

/**
 * Accepts an object key only when it is a plain name inside the trial prefix.
 * Returns the key, or throws with the reason.
 */
export function assertTrialObjectKey(key) {
  if (typeof key !== 'string' || !key) throw new Error('Refusing to delete an empty object key');
  if (key.includes('\\')) throw new Error(`Refusing "${key}": backslashes are not allowed`);
  if (key.includes('\0')) throw new Error(`Refusing "${key}": NUL bytes are not allowed`);
  if (/%(2e|2f|5c)/i.test(key)) throw new Error(`Refusing "${key}": percent-encoded separators are not allowed`);
  if (key.startsWith('/')) throw new Error(`Refusing "${key}": absolute paths are not allowed`);
  if (!key.startsWith(TRIAL_PREFIX)) {
    throw new Error(`Refusing "${key}": only ${AUDIO_BUCKET}/${TRIAL_PREFIX} may be deleted`);
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
export function assertDeletableKeys(keys) {
  if (!Array.isArray(keys) || keys.length === 0) throw new Error('Refusing to delete nothing');
  return keys.map(assertTrialObjectKey);
}

/**
 * The only files a week may own inside the prefix: its MP3 and its WebVTT.
 * Anything else is refused even if the name is otherwise well formed.
 */
export function assertTrialTrackKey(key) {
  assertTrialObjectKey(key);
  const allowed = TRIAL_WEEKS.flatMap((week) => [`week-${week}-listening.mp3`, `week-${week}-listening.vtt`]);
  if (!allowed.includes(key.slice(TRIAL_PREFIX.length))) {
    throw new Error(`Refusing "${key}": it is not one of the trial track files (${allowed.length} allowed)`);
  }
  return key;
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

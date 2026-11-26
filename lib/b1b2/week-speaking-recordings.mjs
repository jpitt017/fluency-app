/**
 * Shared, client-safe helpers for the learner's weekly speaking recordings.
 *
 * Storage keys are always `<auth user id>/week-speaking/<week>/<attempt>/take-<n>.<ext>`.
 * The browser never receives a Storage key or a signed URL from a page: it gets
 * a short route URL and the route handler mints a 60-second link on the server.
 */

export const WEEK_SPEAKING_BUCKET = 'speaking-recordings';
export const WEEK_SPEAKING_SIGNED_URL_SECONDS = 60;
export const WEEK_SPEAKING_TAKES = [1, 2];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/week-speaking\/([1-4])\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/take-([12])\.(webm|ogg|m4a)$/i;
const CONTENT_TYPE_BY_EXTENSION = {
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
};

function extensionFor(mimeType) {
  const type = String(mimeType || '').toLowerCase();
  if (type.includes('mp4') || type.includes('m4a')) return 'm4a';
  if (type.includes('ogg')) return 'ogg';
  return 'webm';
}

/** Build the one canonical, owner-prefixed Storage key for a weekly take. */
export function weekSpeakingRecordingPath({ userId, weekNumber, attemptId, takeNumber, mimeType = 'audio/webm' }) {
  const user = String(userId ?? '');
  const attempt = String(attemptId ?? '');
  const week = Number(weekNumber);
  const take = Number(takeNumber);
  if (!UUID_RE.test(user)) throw new TypeError('A weekly recording needs a valid learner user id.');
  if (!Number.isInteger(week) || week < 1 || week > 4) throw new TypeError('Weekly recordings cover weeks 1–4.');
  if (!UUID_RE.test(attempt)) throw new TypeError('A weekly recording needs a valid attempt id.');
  if (take !== 1 && take !== 2) throw new TypeError('Weekly recordings have takes 1 and 2 only.');
  return `${user}/week-speaking/${week}/${attempt}/take-${take}.${extensionFor(mimeType)}`;
}

/** Parse an owner-prefixed weekly recording key, or return null for anything else. */
export function parseWeekSpeakingRecordingPath(path) {
  if (typeof path !== 'string') return null;
  const match = PATH_RE.exec(path);
  if (!match) return null;
  return {
    userId: match[1],
    weekNumber: Number(match[2]),
    attemptId: match[3],
    takeNumber: Number(match[4]),
    extension: match[5].toLowerCase(),
  };
}

export function isOwnedWeekSpeakingRecordingPath(path, userId) {
  const parsed = parseWeekSpeakingRecordingPath(path);
  return Boolean(parsed && parsed.userId === String(userId ?? ''));
}

export function recordingContentTypeFromPath(path) {
  const parsed = parseWeekSpeakingRecordingPath(path);
  return parsed ? CONTENT_TYPE_BY_EXTENSION[parsed.extension] : null;
}

/** The page-facing URL. Following it asks the server for a fresh signed link. */
export function weekSpeakingRecordingHref(attemptId, takeNumber) {
  const attempt = String(attemptId ?? '');
  const take = Number(takeNumber);
  if (!UUID_RE.test(attempt) || (take !== 1 && take !== 2)) {
    throw new TypeError('A weekly recording link needs a valid attempt id and take.');
  }
  return `/api/week/speaking/recording/${encodeURIComponent(attempt)}/${take}`;
}

/** Project only safe playback links from a database row; never return Storage keys. */
export function weekSpeakingAttemptRecordings(attempt) {
  if (!attempt || typeof attempt !== 'object') return [];
  const links = [];
  for (const [takeNumber, key] of [
    [1, 'first_recording_path'],
    [2, 'second_recording_path'],
  ]) {
    const path = attempt[key];
    const parsed = parseWeekSpeakingRecordingPath(path);
    if (!parsed
      || parsed.userId !== String(attempt.user_id ?? '')
      || parsed.attemptId !== String(attempt.id ?? '')
      || parsed.weekNumber !== Number(attempt.week_number)
      || parsed.takeNumber !== takeNumber) continue;
    links.push({
      id: `${attempt.id}:${takeNumber}`,
      attemptId: String(attempt.id),
      weekNumber: parsed.weekNumber,
      takeNumber,
      label: `Week ${parsed.weekNumber} · ${takeNumber === 1 ? 'First recording' : 'Second recording'}`,
      href: weekSpeakingRecordingHref(attempt.id, takeNumber),
    });
  }
  return links;
}

/** Server-side helper: the only place a weekly recording signed URL is minted. */
export async function createWeekSpeakingSignedUrl(client, path) {
  const { data, error } = await client.storage
    .from(WEEK_SPEAKING_BUCKET)
    .createSignedUrl(path, WEEK_SPEAKING_SIGNED_URL_SECONDS);
  return { signedUrl: error ? null : data?.signedUrl ?? null, error: error ?? null };
}

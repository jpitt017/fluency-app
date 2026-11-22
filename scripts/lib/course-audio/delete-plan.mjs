/**
 * Orchestration for the `delete` mode, kept out of the CLI so every rule can be
 * tested with fakes: path confinement, dry run unless confirmed, and no
 * deletion of a released week.
 *
 * Two buckets per week:
 *   course-audio-review  the working copy: MP3, WebVTT and voice-check clips
 *   course-audio         the public copy, present only after `--release`
 *
 * A delete clears both. The public one has to go too, otherwise a deleted week
 * would stay playable from a URL that the row no longer points at.
 */

import { deleteReleasedFiles, deleteReviewFiles, listReviewFiles } from './publish.mjs';
import {
  AUDIO_BUCKET,
  DEFAULT_REVIEW_BUCKET,
  assertNotReleased,
  assertTrialWeek,
  isConfirmed,
  trialObjectKeys,
} from './delete-guard.mjs';

/** Public objects a released week may have, so the plan can report them. */
async function listReleasedFiles(client, week) {
  const { data, error } = await client.storage.from(AUDIO_BUCKET).list(trialObjectKeys(week)[0].split('/').slice(0, -1).join('/'), {
    limit: 100,
  });
  if (error) throw new Error(`Could not list ${AUDIO_BUCKET}: ${JSON.stringify(error)}`);
  const prefix = `week-${week}-listening`;
  return (data ?? []).map((item) => item.name).filter((name) => typeof name === 'string' && name.startsWith(prefix));
}

/**
 * Read-only report of what a confirmed delete would remove. Never calls
 * Storage's remove.
 *
 * @returns {Promise<{week: number, released: boolean, present: string[], missing: string[], blocked: string|null}[]>}
 */
export async function planTrialDeletion(weeks, client) {
  if (!Array.isArray(weeks) || weeks.length === 0) throw new Error('Deletion needs at least one week');
  const plan = [];
  for (const rawWeek of weeks) {
    const week = assertTrialWeek(rawWeek);
    const expected = trialObjectKeys(week);
    const state = await client
      .from('listening_audio_trials')
      .select('week, released')
      .eq('week', week)
      .maybeSingle();
    if (state.error) throw new Error(`Could not read week ${week}: ${state.error.message}`);
    // No row at all means nothing was ever generated for the week: not released.
    const released = state.data?.released === true;
    let blocked = null;
    if (released) blocked = 'released for learners';
    // List both buckets so the report shows exactly what a revoke would expose,
    // and so a released week still reports its files rather than hiding them.
    const present = await listReviewFiles(client, week, DEFAULT_REVIEW_BUCKET);
    const publicFiles = await listReleasedFiles(client, week);
    plan.push({
      week,
      released,
      present,
      publicFiles,
      missing: expected.filter((key) => !present.includes(key.split('/').pop())),
      blocked,
    });
  }
  return plan;
}

/** One-line-per-week summary, shared by the dry run and the real run. */
export function describePlan(plan, { confirmed }) {
  const lines = [];
  for (const entry of plan) {
    const expected = trialObjectKeys(entry.week);
    const found = entry.present.length ? entry.present.join(', ') : 'no files in the review bucket';
    const publicFound = entry.publicFiles?.length ? ` public copy: ${entry.publicFiles.join(', ')}` : ' no public copy';
    if (entry.blocked) {
      lines.push(`Week ${entry.week}: BLOCKED - ${entry.blocked}. Revoke it first; nothing was deleted.`);
      continue;
    }
    const action = confirmed ? 'will delete' : 'would delete';
    lines.push(
      confirmed
        ? `Week ${entry.week}: deleting ${found};${publicFound}`
        : `Week ${entry.week}: ${action} ${expected.length} file(s) - ${found};${publicFound}`,
    );
  }
  return lines;
}

/**
 * Deletes the weeks' files, but only when `confirmed` is exactly true.
 *
 * Order per week: validate the week, refuse a released week, delete the review
 * copy, delete any public copy, clear the URLs on the row (the row stays
 * unreleased so the page keeps saying "Audio coming soon."), then re-list to
 * prove the review files are gone.
 *
 * @returns {Promise<{deleted: string[], previews: string[], confirmed: boolean}>}
 */
export async function runTrialDeletion(weeks, client, { confirmed } = {}) {
  const plan = await planTrialDeletion(weeks, client);
  const previews = describePlan(plan, { confirmed: isConfirmed(confirmed) });

  if (!isConfirmed(confirmed)) {
    return { deleted: [], previews, confirmed: false };
  }

  const blocked = plan.filter((entry) => entry.blocked);
  if (blocked.length) {
    throw new Error(
      `Refusing to delete released week(s) ${blocked.map((entry) => entry.week).join(', ')}. Revoke them first, then delete.`,
    );
  }

  const deleted = [];
  for (const entry of plan) {
    assertNotReleased(entry.week, entry.released);
    const removed = await deleteReviewFiles(client, entry.week);
    const publicRemoved = await deleteReleasedFiles(client, entry.week);
    const { error } = await client
      .from('listening_audio_trials')
      .update({
        audio_url: null,
        captions_url: null,
        released: false,
        released_at: null,
        voices: null,
        model: null,
      })
      .eq('week', entry.week);
    if (error) throw new Error(`Could not clear the row for week ${entry.week}: ${JSON.stringify(error)}`);
    const left = await listReviewFiles(client, entry.week);
    if (left.length) throw new Error(`Week ${entry.week} still has ${left.join(', ')} in the review bucket`);
    deleted.push(...removed, ...publicRemoved);
  }
  return { deleted, previews: describePlan(plan, { confirmed: true }), confirmed: true };
}

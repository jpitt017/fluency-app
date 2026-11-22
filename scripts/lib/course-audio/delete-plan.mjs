/**
 * Orchestration for the `delete` mode, kept out of the CLI so every rule can be
 * tested with fakes: path confinement, dry run unless confirmed, and no
 * deletion of a released week.
 */

import { deleteTrialFiles, listTrialFiles } from './publish.mjs';
import { assertNotReleased, assertTrialWeek, isConfirmed, trialObjectKeys } from './delete-guard.mjs';

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
    let present = [];
    let blocked = null;
    if (released) {
      blocked = 'released for learners';
      // Still list the files so the report shows what a revoke would expose.
      present = await listTrialFiles(client, week);
    } else {
      present = await listTrialFiles(client, week);
    }
    plan.push({
      week,
      released,
      present,
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
    const found = entry.present.length ? entry.present.join(', ') : 'no files in the bucket';
    if (entry.blocked) {
      lines.push(`Week ${entry.week}: BLOCKED - ${entry.blocked}. Revoke it first; nothing was deleted.`);
      continue;
    }
    const action = confirmed ? 'will delete' : 'would delete';
    lines.push(
      confirmed
        ? `Week ${entry.week}: deleting ${found}`
        : `Week ${entry.week}: ${action} ${expected.length} file(s) - ${found}`,
    );
  }
  return lines;
}

/**
 * Deletes the weeks' files, but only when `confirmed` is exactly true.
 *
 * Order per week: validate the week, refuse a released week, delete the files,
 * clear the public URLs on the row (the row stays unreleased so the page keeps
 * saying "Audio coming soon."), then re-list to prove the files are gone.
 *
 * @returns {Promise<{deleted: string[], previews: ReturnType<typeof describePlan>, confirmed: boolean}>}
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
    const removed = await deleteTrialFiles(client, entry.week);
    const { error } = await client
      .from('listening_audio_trials')
      .update({ audio_url: null, captions_url: null, released: false, released_at: null, voices: null, model: null })
      .eq('week', entry.week);
    if (error) throw new Error(`Could not clear the row for week ${entry.week}: ${JSON.stringify(error)}`);
    const left = await listTrialFiles(client, entry.week);
    if (left.length) throw new Error(`Week ${entry.week} still has ${left.join(', ')} in the bucket`);
    deleted.push(...removed);
  }
  return { deleted, previews: describePlan(plan, { confirmed: true }), confirmed: true };
}

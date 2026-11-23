import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TRIAL_PREFIX,
  assertDeletableKeys,
  assertNotReleased,
  assertTrialObjectKey,
  assertTrialTrackKey,
  assertTrialWeek,
  isConfirmed,
  isTrialFileName,
  trialObjectKeys,
  assertReviewKey,
} from '../../scripts/lib/course-audio/delete-guard.mjs';
import { planTrialDeletion, runTrialDeletion } from '../../scripts/lib/course-audio/delete-plan.mjs';

const workflow = readFileSync(new URL('../../.github/workflows/course-audio.yml', import.meta.url), 'utf8');
const cli = readFileSync(new URL('../../scripts/generate-course-audio.mjs', import.meta.url), 'utf8');

/**
 * Fake Supabase: storage with removable objects, and approval rows. Records every
 * call so the tests can prove mutation never happened.
 */
function fakeSupabase(rows = {}, files = {}) {
  const objects = new Map(Object.entries(files));
  const calls = { remove: [], list: [], select: [], update: [], buckets: [] };
  return {
    objects,
    calls,
    rows,
    client: {
      storage: {
        from(bucket) {
          calls.buckets.push(bucket);
          assert.ok(
            ['course-audio', 'course-audio-review'].includes(bucket),
            `only the pipeline's two buckets are touched, not ${bucket}`,
          );
          // Objects are held in one map, so a test can seed a public copy too.
          return {
            async remove(keys) {
              calls.remove.push([...keys]);
              const removed = keys.filter((key) => objects.has(key));
              removed.forEach((key) => objects.delete(key));
              return { data: removed.map((name) => ({ name })), error: null };
            },
            async list(prefix) {
              calls.list.push(prefix);
              return {
                data: [...objects.keys()]
                  .filter((key) => key.startsWith(`${prefix}/`))
                  .map((key) => ({ name: key.slice(prefix.length + 1) })),
                error: null,
              };
            },
          };
        },
      },
      from(table) {
        assert.equal(table, 'listening_audio_trials');
        return {
          select(fields) {
            calls.select.push(fields);
            return {
              eq(column, value) {
                assert.equal(column, 'week');
                return {
                  async maybeSingle() {
                    return { data: rows[value] ?? null, error: null };
                  },
                };
              },
            };
          },
          update(values) {
            calls.update.push(values);
            return { eq: async (column, value) => (calls.update.push({ [column]: value }), { error: null }) };
          },
        };
      },
    },
  };
}

const seed = (week) => Object.fromEntries(trialObjectKeys(week).map((key) => [key, 'bytes']));

// ---------------------------------------------------------------- paths (1)

test('object keys are confined to weeks-01-04/ai-trial and reject traversal', () => {
  assert.equal(TRIAL_PREFIX, 'weeks-01-04/ai-trial/');
  assert.deepEqual(trialObjectKeys(2), [
    'weeks-01-04/ai-trial/week-2-listening.mp3',
    'weeks-01-04/ai-trial/week-2-listening.vtt',
  ]);

  const refused = [
    'weeks-01-04/ai-trial/../../other/week-1-listening.mp3',
    'weeks-01-04/ai-trial/week-1-listening.mp3/../../../x',
    'weeks-01-04/ai-trial/..',
    '../../speaking-recordings/user-1/recording.webm',
    'speaking-recordings/user-1/recording.webm',
    'week-1-listening.mp3',
    '/weeks-01-04/ai-trial/week-1-listening.mp3',
    'weeks-01-04/ai-trial/nested/week-1-listening.mp3',
    'weeks-01-04/ai-trial//week-1-listening.mp3',
    'weeks-01-04/ai-trial/week%2e%2e%2fsecret.mp3',
    'weeks-01-04/ai-trial/week-1-listening.mp3\0.png',
    'weeks-01-04\\ai-trial\\week-1-listening.mp3',
    'weeks-01-04/ai-trial/',
    '',
  ];
  for (const key of refused) {
    assert.throws(() => assertTrialObjectKey(key), /Refusing/, `should refuse ${JSON.stringify(key)}`);
  }
  for (const key of trialObjectKeys(1).concat(trialObjectKeys(4))) {
    assert.equal(assertTrialObjectKey(key), key);
  }
  // Well-formed names that are not one of the eight trial track files are also refused.
  for (const key of [
    'weeks-01-04/ai-trial/week-1-listening.wav',
    'weeks-01-04/ai-trial/week-5-listening.mp3',
    'weeks-01-04/ai-trial/notes.txt',
    'weeks-01-04/ai-trial/week-1-listening.mp3.bak',
  ]) {
    assert.throws(() => assertTrialTrackKey(key), /Refusing/, `should refuse ${key}`);
  }
  for (const key of trialObjectKeys(1).concat(trialObjectKeys(4))) {
    assert.equal(assertTrialTrackKey(key), key);
  }

  assert.throws(() => assertDeletableKeys([]), /Refusing to delete nothing/);
  assert.throws(() => assertDeletableKeys(['weeks-01-04/ai-trial/../../x']), /Refusing/);
  assert.deepEqual(assertDeletableKeys(trialObjectKeys(3)), trialObjectKeys(3));
});

test('a review key is a track, a voice check, or a per-speaker sample — nothing else', () => {
  for (const key of [
    'weeks-01-04/ai-trial/week-3-listening.mp3',
    'weeks-01-04/ai-trial/week-3-listening.vtt',
    'weeks-01-04/ai-trial/voice-check-Marta.mp3',
    'weeks-01-04/ai-trial/week-3-sample-Dan.mp3',
    'weeks-01-04/ai-trial/week-3-sample-Marta.mp3',
  ]) {
    assert.equal(assertReviewKey(key), key);
  }
  for (const key of [
    'weeks-01-04/ai-trial/week-3-sample-Dan.wav',
    'weeks-01-04/ai-trial/week-5-sample-Dan.mp3',
    'weeks-01-04/ai-trial/week-3-sample-Dan.mp3.bak',
    'weeks-01-04/ai-trial/sample-Dan.mp3',
    'weeks-01-04/ai-trial/voice-check-Marta.wav',
    'weeks-01-04/ai-trial/notes.txt',
  ]) {
    assert.throws(() => assertReviewKey(key), /Refusing/, `should refuse ${key}`);
  }
  // A sample is audition material, so it can never be uploaded to the live bucket.
  assert.throws(
    () => assertReviewKey('weeks-01-04/ai-trial/week-3-sample-Dan.mp3', 'course-audio'),
    /Refusing/,
  );
});

test('a week must be a whole number from 1 to 4, so it cannot smuggle a path', () => {
  for (const good of [1, 2, 3, 4]) assert.equal(assertTrialWeek(good), good);
  const bad = [
    0,
    5,
    32,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '1',
    '../x',
    '../../speaking-recordings/x',
    '1/../../x',
    '1e3',
    null,
    undefined,
  ];
  for (const week of bad) {
    assert.throws(() => assertTrialWeek(week), /Refusing week/, `should refuse ${String(week)}`);
    assert.throws(() => trialObjectKeys(week), /Refusing week/, `trialObjectKeys should refuse ${String(week)}`);
  }
});

test('storage listing names are filtered, so a weird name cannot steer a later call', () => {
  assert.equal(isTrialFileName('week-1-listening.mp3'), true);
  for (const name of ['../week-1-listening.mp3', 'nested/week-1-listening.mp3', '', '.hidden', 'week 1.mp3']) {
    assert.equal(isTrialFileName(name), false, `should reject ${JSON.stringify(name)}`);
  }
});

// -------------------------------------------------------------- dry run (2)

test('only a literal true confirms a delete', () => {
  assert.equal(isConfirmed(true), true);
  assert.equal(isConfirmed('true'), true);
  for (const value of [false, 'false', 'TRUE', 'yes', 1, '1', '', null, undefined, {}]) {
    assert.equal(isConfirmed(value), false, `should not confirm ${JSON.stringify(value)}`);
  }
});

test('without confirmation the delete is a dry run: nothing is removed or updated', async () => {
  const fake = fakeSupabase({ 1: { week: 1, released: false } }, seed(1));

  for (const confirmed of [undefined, false, 'false', 'yes', 1]) {
    const result = await runTrialDeletion([1], fake.client, { confirmed });
    assert.equal(result.confirmed, false);
    assert.deepEqual(result.deleted, []);
    assert.match(result.previews.join('\n'), /Week 1: would delete 2 file\(s\)/);
  }
  assert.deepEqual(fake.calls.remove, [], 'storage.remove is never called');
  assert.deepEqual(fake.calls.update, [], 'the approval row is never updated');
  assert.equal(fake.objects.size, 2, 'the files are still in the bucket');
});

test('a dry run still reports released weeks as blocked', async () => {
  const fake = fakeSupabase({ 2: { week: 2, released: true } }, seed(2));
  const result = await runTrialDeletion([2], fake.client, { confirmed: false });
  assert.match(result.previews.join('\n'), /Week 2: BLOCKED - released for learners/);
  assert.deepEqual(fake.calls.remove, []);
});

// ------------------------------------------------------------------ released (3)

test('a released week is refused even when the delete is confirmed', async () => {
  const fake = fakeSupabase({ 1: { week: 1, released: true }, 2: { week: 2, released: false } }, {
    ...seed(1),
    ...seed(2),
  });

  await assert.rejects(
    () => runTrialDeletion([1, 2], fake.client, { confirmed: true }),
    /Refusing to delete released week\(s\) 1\b.*Revoke/,
  );
  assert.deepEqual(fake.calls.remove, [], 'nothing is deleted when one week in the batch is live');
  assert.deepEqual(fake.calls.update, [], 'no approval rows are touched');
  assert.equal(fake.objects.size, 4);
});

test('assertNotReleased is the last line of defence', () => {
  assert.equal(assertNotReleased(1, false), 1);
  assert.equal(assertNotReleased(1, undefined), 1);
  assert.equal(assertNotReleased(1, null), 1);
  assert.throws(() => assertNotReleased(1, true), /it is released for learners/);
});

// ----------------------------------------------------------------- the real run

test('a confirmed delete removes both files, clears the row and re-lists to prove it', async () => {
  const fake = fakeSupabase({ 1: { week: 1, released: false } }, { ...seed(1), ...seed(2) });

  const result = await runTrialDeletion([1], fake.client, { confirmed: true });
  assert.equal(result.confirmed, true);
  // The review copy and the public copy are both removed; neither has to exist.
  assert.deepEqual(result.deleted, trialObjectKeys(1));
  assert.deepEqual(fake.calls.remove, [trialObjectKeys(1), trialObjectKeys(1)]);
  assert.equal(fake.objects.has('weeks-01-04/ai-trial/week-1-listening.mp3'), false);
  assert.equal(fake.objects.has('weeks-01-04/ai-trial/week-1-listening.vtt'), false);
  assert.equal(fake.objects.size, 2, 'week 2 is untouched');

  const cleared = fake.calls.update[0];
  assert.equal(cleared.audio_url, null);
  assert.equal(cleared.captions_url, null);
  assert.equal(cleared.released, false);
  assert.deepEqual(fake.calls.update[1], { week: 1 });
  assert.ok(fake.calls.list.length >= 2, 'listed before and after deleting');
  assert.deepEqual(new Set(fake.calls.buckets), new Set(['course-audio-review', 'course-audio']));
});

test('a week with no approval row counts as unreleased and can be cleaned up', async () => {
  const fake = fakeSupabase({}, seed(3));
  const plan = await planTrialDeletion([3], fake.client);
  assert.equal(plan[0].released, false);
  assert.equal(plan[0].present.length, 2);
  const result = await runTrialDeletion([3], fake.client, { confirmed: true });
  assert.equal(result.deleted.length, 2);
});

// ------------------------------------------------------------- wiring checks

test('the workflow cannot delete without an explicit confirm input', () => {
  assert.match(workflow, /confirm:\n\s+description: 'delete: actually delete.*\n\s+type: boolean\n\s+default: false/);
  const step = workflow.split('Delete the files from both buckets')[1].split('- name: Approval state')[0];
  assert.match(step, /if \[ "\$\{\{ inputs\.confirm \}\}" = "true" \]/);
  assert.match(step, /--delete-trial --weeks "\$\{\{ inputs\.weeks \}\}" --confirm/, 'confirm is only passed in that branch');
  assert.match(step, /--delete-trial --weeks "\$\{\{ inputs\.weeks \}\}"\n/, 'the default branch has no --confirm');
});

test('the CLI refuses unconfirmed deletes and non-numeric weeks', () => {
  // The dry run is the default path in the CLI, not an extra flag.
  assert.match(cli, /async function deleteTrialFiles\(weeks, confirmed\)/);
  assert.match(cli, /runTrialDeletion\(weeks, client, \{ confirmed \}\)/);
  assert.match(cli, /return deleteTrialFiles\(weekList \?\? \[\], confirmDelete\)/);
  assert.match(cli, /Dry run: nothing was deleted\. Re-run with --confirm/);
  assert.match(cli, /if \(!\/\^\[0-9\]\{1,2\}\$\//, 'week arguments must be digits only');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  WEEK_SPEAKING_BUCKET,
  WEEK_SPEAKING_SIGNED_URL_SECONDS,
  createWeekSpeakingSignedUrl,
  isOwnedWeekSpeakingRecordingPath,
  parseWeekSpeakingRecordingPath,
  recordingContentTypeFromPath,
  weekSpeakingAttemptRecordings,
  weekSpeakingRecordingHref,
  weekSpeakingRecordingPath,
} from '../../lib/b1b2/week-speaking-recordings.mjs';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';

test('weekly takes use one canonical private, owner-prefixed key', () => {
  const path = weekSpeakingRecordingPath({
    userId: USER_ID, weekNumber: 2, attemptId: ATTEMPT_ID, takeNumber: 1, mimeType: 'audio/webm',
  });
  assert.equal(path, `${USER_ID}/week-speaking/2/${ATTEMPT_ID}/take-1.webm`);
  assert.deepEqual(parseWeekSpeakingRecordingPath(path), {
    userId: USER_ID, weekNumber: 2, attemptId: ATTEMPT_ID, takeNumber: 1, extension: 'webm',
  });
  assert.equal(isOwnedWeekSpeakingRecordingPath(path, USER_ID), true);
  assert.equal(isOwnedWeekSpeakingRecordingPath(path, OTHER_USER_ID), false);
  assert.equal(recordingContentTypeFromPath(path), 'audio/webm');
  assert.equal(recordingContentTypeFromPath(weekSpeakingRecordingPath({
    userId: USER_ID, weekNumber: 2, attemptId: ATTEMPT_ID, takeNumber: 2, mimeType: 'audio/mp4',
  })), 'audio/mp4');
  assert.equal(weekSpeakingRecordingHref(ATTEMPT_ID, 2), `/api/week/speaking/recording/${ATTEMPT_ID}/2`);
  assert.equal(WEEK_SPEAKING_BUCKET, 'speaking-recordings');
  assert.equal(WEEK_SPEAKING_SIGNED_URL_SECONDS, 60);
});

test('invalid or foreign recording paths are rejected', () => {
  for (const input of [
    null,
    `not-a-uuid/week-speaking/2/${ATTEMPT_ID}/take-1.webm`,
    `${USER_ID}/other/2/${ATTEMPT_ID}/take-1.webm`,
    `${USER_ID}/week-speaking/9/${ATTEMPT_ID}/take-1.webm`,
    `${USER_ID}/week-speaking/2/${ATTEMPT_ID}/take-3.webm`,
    `${USER_ID}/week-speaking/2/${ATTEMPT_ID}/take-1.exe`,
    `${USER_ID}/week-speaking/2/${ATTEMPT_ID}/../take-1.webm`,
  ]) {
    assert.equal(parseWeekSpeakingRecordingPath(input), null);
  }
  const foreignPath = `${OTHER_USER_ID}/week-speaking/2/${ATTEMPT_ID}/take-1.webm`;
  assert.equal(parseWeekSpeakingRecordingPath(foreignPath)?.userId, OTHER_USER_ID);
  assert.equal(isOwnedWeekSpeakingRecordingPath(foreignPath, USER_ID), false);
  assert.throws(() => weekSpeakingRecordingPath({
    userId: 'not-a-uuid', weekNumber: 1, attemptId: ATTEMPT_ID, takeNumber: 1,
  }), TypeError);
  assert.throws(() => weekSpeakingRecordingPath({
    userId: USER_ID, weekNumber: 5, attemptId: ATTEMPT_ID, takeNumber: 1,
  }), TypeError);
});

test('the page projection has playback links, never Storage keys or signed URLs', () => {
  const attempt = {
    id: ATTEMPT_ID,
    user_id: USER_ID,
    week_number: 1,
    first_recording_path: weekSpeakingRecordingPath({ userId: USER_ID, weekNumber: 1, attemptId: ATTEMPT_ID, takeNumber: 1 }),
    second_recording_path: weekSpeakingRecordingPath({ userId: USER_ID, weekNumber: 1, attemptId: ATTEMPT_ID, takeNumber: 2, mimeType: 'audio/ogg' }),
  };
  const recordings = weekSpeakingAttemptRecordings(attempt);
  assert.equal(recordings.length, 2);
  assert.deepEqual(recordings.map((item) => item.takeNumber), [1, 2]);
  assert.match(recordings[0].href, /^\/api\/week\/speaking\/recording\//);
  assert.equal(JSON.stringify(recordings).includes('week-speaking/'), false);
  assert.equal(JSON.stringify(recordings).includes('token='), false);

  // A row whose path does not match its owner, week or attempt is not exposed.
  assert.deepEqual(weekSpeakingAttemptRecordings({ ...attempt, user_id: OTHER_USER_ID }), []);
  assert.deepEqual(weekSpeakingAttemptRecordings({ ...attempt, week_number: 2 }), []);
  assert.deepEqual(weekSpeakingAttemptRecordings({ ...attempt, second_recording_path: null }), recordings.slice(0, 1));
});

test('signed links are server-created for exactly 60 seconds', async () => {
  const calls = [];
  const client = {
    storage: {
      from(bucket) {
        calls.push(['from', bucket]);
        return {
          async createSignedUrl(path, seconds) {
            calls.push(['createSignedUrl', path, seconds]);
            return { data: { signedUrl: 'https://storage.example.test/signed?token=secret' }, error: null };
          },
        };
      },
    },
  };
  const path = weekSpeakingRecordingPath({ userId: USER_ID, weekNumber: 1, attemptId: ATTEMPT_ID, takeNumber: 1 });
  const result = await createWeekSpeakingSignedUrl(client, path);
  assert.equal(result.signedUrl, 'https://storage.example.test/signed?token=secret');
  assert.deepEqual(calls, [
    ['from', 'speaking-recordings'],
    ['createSignedUrl', path, 60],
  ]);
});

test('the playback route is owner/staff gated, no-store, and does not return a Storage key', () => {
  const route = readFileSync('src/app/api/week/speaking/recording/[attemptId]/[take]/route.ts', 'utf8');
  assert.match(route, /export async function GET/);
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /\.eq\('user_id', user\.id\)/);
  assert.match(route, /role === 'teacher' \|\| .*role === 'admin'/s);
  assert.match(route, /parsed\.userId !== attempt\.user_id/);
  assert.match(route, /createWeekSpeakingSignedUrl\(readClient, path\)/);
  assert.match(route, /status: 302/);
  assert.match(route, /'cache-control': 'private, no-store, max-age=0'/);
  assert.doesNotMatch(route, /NextResponse\.json\(\{[^}]*signedUrl/);
});

test('learner and teacher views both use the same playback component', () => {
  const learner = readFileSync('components/b1b2/WeekSpeakingSupport.tsx', 'utf8');
  const weekPage = readFileSync('src/app/week/[n]/page.tsx', 'utf8');
  const teacher = readFileSync('components/b1b2/TeacherConsoleClient.tsx', 'utf8');
  const roster = readFileSync('lib/b1b2/data.ts', 'utf8');
  assert.match(learner, /<WeekSpeakingRecordings recordings=\{props\.recordings\}/);
  assert.match(weekPage, /recordings=\{speakingSupport\.recordings\}/);
  assert.match(teacher, /Weekly speaking recordings/);
  assert.match(roster, /weekSpeakingAttemptRecordings\(row\)/);
  assert.match(roster, /weekly_recordings:/);
});

test('the evaluate route keeps its existing unlocking call and shared canonical path', () => {
  const source = readFileSync('src/app/api/speaking/evaluate/route.ts', 'utf8');
  const learnerProjection = readFileSync('lib/curriculum/week-speaking-support.ts', 'utf8');
  assert.match(source, /recordWeekSubmission\(guard\.userId, weekNumber, 'speaking'\)/);
  assert.match(source, /weekSpeakingRecordingPath\(\{/);
  assert.match(source, /first_recording_path: storagePath/);
  assert.match(source, /second_recording_path: storagePath/);
  assert.match(learnerProjection, /recordings: weekSpeakingAttemptRecordings\(attempt\)/);
});

test('migration 0062 keeps the bucket private and adds only read-only staff policies', () => {
  const migration = readFileSync('supabase-b1-b2/migrations/0062_week_speaking_recording_access.sql', 'utf8');
  assert.match(migration, /false,\s*26214400/s);
  assert.match(migration, /set public = false/);
  assert.match(migration, /update storage\.buckets set public = false/);
  assert.match(migration, /"week speaking attempts staff read"/);
  assert.match(migration, /"week speaking recordings staff read"/);
  assert.match(migration, /\[2\] = 'week-speaking'/);
  assert.match(migration, /public\.is_staff\(\)/);
  assert.match(migration, /recordings own read/);
  assert.match(migration, /verify_delete_my_learning_data_coverage/);
  assert.doesNotMatch(migration, /for insert to authenticated|for update to authenticated|for delete to authenticated/);
  assert.doesNotMatch(migration, /create or replace function/i);
});

test('Delete my data and fresh-replay coverage include both weekly takes', () => {
  const route = readFileSync('src/app/api/account/delete-data/route.ts', 'utf8');
  const replay = readFileSync('tests/database/week-speaking-recordings.sql', 'utf8');
  const verify = readFileSync('tests/database/verify-replay-schema.sql', 'utf8');
  const replayAll = readFileSync('tests/database/delete-learning-data.sql', 'utf8');
  assert.match(route, /week_speaking_attempts/);
  assert.match(route, /first_recording_path/);
  assert.match(route, /second_recording_path/);
  assert.match(replay, /result->'audio_paths' \? path1/);
  assert.match(replay, /result->'audio_paths' \? path2/);
  assert.match(replay, /another learner''s recording/);
  assert.match(verify, /\\ir week-speaking-recordings\.sql/);
  assert.match(replayAll, /week_speaking_attempts/);
  assert.match(replayAll, /verify_delete_my_learning_data_coverage/);
});

test('the live rollout helper prints but never executes SQL', () => {
  const source = readFileSync('scripts/prepare-week-speaking-0062-rollout.mjs', 'utf8');
  const before = readFileSync('docs/rollouts/week-speaking-recordings-0062-live-before.md', 'utf8');
  assert.match(source, /process\.stdout\.write/);
  assert.match(source, /on conflict \(version\) do nothing/);
  assert.doesNotMatch(source, /execute_query\(|fetch\(|createClient\(/);
  assert.match(before, /before-state inspection only/);
  assert.match(before, /Post-apply verification \(owner approved\)/);
  assert.match(before, /`course-audio` remains public/);
  assert.match(before, /public\.verify_app_schema\(\)` returned `covered = true`/);
});

test('isolated E2E cleanup clears nested weekly recordings', () => {
  const source = readFileSync('scripts/lib/test-user.mjs', 'utf8');
  assert.match(source, /clearUserStorage\(admin\.storage, bucket, id\)/);
  assert.match(source, /'speaking-recordings'/);
  assert.match(source, /'week_speaking_attempts'/);
});

test('E2E RLS checks cover foreign weekly files, anon links and staff playback', () => {
  const rls = readFileSync('scripts/test-rls.mjs', 'utf8');
  const e2e = readFileSync('tests/e2e/week-speaking-recordings.spec.mjs', 'utf8');
  assert.match(rls, /could see another learner’s weekly recording files/);
  assert.match(rls, /learner minted a signed URL for another learner’s weekly recording/);
  assert.match(rls, /anonymous viewer minted a signed URL for a weekly recording/);
  assert.match(rls, /teacher could not sign weekly recording/);
  assert.match(rls, /speaking-recordings is a public bucket/);
  assert.match(e2e, /ownerPage\.request\.get\(`\/api\/week\/speaking\/recording/);
  assert.match(e2e, /expect\(foreign\.status\(\)\)\.toBe\(404\)/);
  assert.match(e2e, /Weekly speaking recordings/);
});

test('CI runs the new unit checks and applies migrations only to the isolated E2E target', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(ci, /node --test tests\/unit\/week-speaking-recordings\.test\.mjs/);
  assert.match(ci, /db push --db-url "\$E2E_SUPABASE_DB_URL" --include-all --yes/);
  assert.doesNotMatch(ci, /db push[^\n]*--include-all[^\n]*SUPABASE_LIVE/);
  // PR #105 is merged into main: the real 0059 file is now in the repo, so
  // the earlier CI-only ledger shim must be gone and no history repair is used.
  assert.doesNotMatch(ci, /CI-only ledger shim/);
  assert.doesNotMatch(ci, /to_regclass\('public\.week_sentence_practice'\) is null/);
  assert.equal(existsSync('supabase-b1-b2/migrations/0059_week_sentence_writing_support.sql'), true);
  assert.match(ci, /cp supabase-b1-b2\/migrations\/\*\.sql/);
  assert.doesNotMatch(ci, /migration repair --status reverted 0059/);
});

test('CI mirrors remote-only shared-project versions instead of failing db push', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  // when another open branch applied a version to the shared test project,
  // the apply step must tolerate it with disposable workdir placeholders
  // rather than failing the whole job before any test runs.
  assert.match(ci, /select version from supabase_migrations\.schema_migrations/);
  assert.match(ci, /_shared_project_history\.sql/);
  // the 0059-specific shim and history repair stay gone (see test above).
  assert.doesNotMatch(ci, /CI-only ledger shim/);
  assert.doesNotMatch(ci, /migration repair/);
});

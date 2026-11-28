import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('account deletion removes exact database-recorded paths instead of searching Storage buckets', () => {
  const route = read('src/app/api/account/delete-data/route.ts');
  assert.match(route, /from\(table\)\.select\(columns, \{ count: 'exact' \}\)\.eq\('user_id', user!\.id\)/);
  assert.match(route, /\.order\('id', \{ ascending: true \}\)\.range\(rows\.length, rows\.length \+ 499\)/);
  assert.match(route, /readOwned\('issue_reports', 'audio_path,screenshot_path'\)/);
  assert.match(route, /readOwned\('speaking_attempts', 'audio_path,feedback'\)/);
  assert.match(route, /readOwned\('week_speaking_attempts', 'first_recording_path,second_recording_path,first_feedback,second_feedback'\)/);
  assert.match(route, /readOwned\('week_speaking_takes', 'recording_path,feedback'\)/);
  assert.match(route, /removeFiles\('issue-attachments', issuePaths\)/);
  assert.match(route, /removeFiles\(RECORDING_BUCKET, recordingPaths\)/);
  assert.match(route, /\.remove\(paths\.slice\(start, start \+ 100\)\)/);
  assert.ok(route.indexOf("rpc('begin_week_speaking_deletion'") < route.indexOf("readOwned('week_speaking_takes'"));
  assert.ok(route.indexOf('removeFiles(RECORDING_BUCKET, recordingPaths)') < route.indexOf("rpc('finish_week_speaking_deletion'"));
  assert.match(route, /path\.startsWith\(ownedPrefix\)/);
  assert.doesNotMatch(route, /\.list\(/);
  const deletionFunction = read('supabase-b1-b2/migrations/0024_reconcile_live_schema.sql');
  assert.match(deletionFunction, /public\.speaking_attempts/);
  const weekDeletionFunction = read('supabase-b1-b2/migrations/0060_week_speaking_support.sql');
  assert.match(weekDeletionFunction, /first_recording_path/);
  assert.match(weekDeletionFunction, /second_recording_path/);
});

test('AI quota status is fetched only from the signed-in on-demand API route', () => {
  const dashboard = read('src/app/dashboard/page.tsx');
  const data = read('lib/b1b2/data.ts');
  const client = read('components/b1b2/AiUsageDisclosure.tsx');
  const route = read('src/app/api/ai/usage/route.ts');
  assert.doesNotMatch(dashboard, /loadAiUsageStatus|get_ai_usage_status/);
  assert.doesNotMatch(data, /get_ai_usage_status/);
  assert.match(client, /onClick=\{\(\) => void toggle\(\)\}/);
  assert.match(client, /fetch\('\/api\/ai\/usage'/);
  assert.match(route, /await client\.auth\.getUser\(\)/);
  assert.match(route, /client\.rpc\('get_ai_usage_status'\)/);
  assert.match(route, /private, no-store/);
});

test('refresh_current_week runs only from explicit browser-mounted visit behavior (and placement completion)', () => {
  const refreshRoute = read('src/app/api/week/refresh/route.ts');
  const visit = read('components/b1b2/RefreshCurrentWeekOnVisit.tsx');
  assert.match(visit, /useEffect\(/);
  assert.match(visit, /started\.current = true/);
  assert.match(visit, /fetch\('\/api\/week\/refresh', \{ method: 'POST'/);
  assert.match(refreshRoute, /client\.rpc\('refresh_current_week'\)/);
  for (const file of [
    'src/app/api/week/input/route.ts', 'src/app/api/week/input/mark/route.ts',
    'src/app/api/week/grammar/mark/route.ts', 'src/app/api/week/vocabulary/mark/route.ts',
    'src/app/api/week/reading/gloss/route.ts', 'src/app/api/week/listening/gloss/route.ts',
    'src/app/api/week/sentence/route.ts', 'lib/curriculum/week-practice-finish.ts',
    'lib/curriculum/week-models.ts',
  ]) assert.doesNotMatch(read(file), /refresh_current_week/);
  assert.match(read('components/b1b2/PlacementQuizClient.tsx'), /rpc\('refresh_current_week'\)/);
});

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { test, expect as baseExpect } from '../e2e/helpers/isolated-test.mjs';
import { signInExistingLearner } from '../e2e/helpers/reading-gate.mjs';
import { assertE2ESupabaseApiTarget } from '../../scripts/assert-e2e-supabase-target.mjs';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';

const expect = baseExpect.configure({ timeout: 20_000 });
const pair = process.env.E2E_ROLLOUT_PAIR;
const newApp = pair === 'new-app-old-schema';
const oldApp = pair === 'old-app-new-schema';
if (!newApp && !oldApp) throw new Error('Explicit rollout pair required');
if (process.env.E2E_TAG_TEST_USERS !== 'true') throw new Error('Rollout fixtures must be tagged for isolated cleanup');
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

// The app server is a real production Next build; Auth, PostgREST, Postgres and
// private Storage are the hosted *isolated* Supabase project, not fakes. CI
// builds the old server from the pinned pre-0081 commit. These do not prove a
// Vercel production deployment or remove the documented mixed-version races.
test('learning-data deletion survives the staged application/schema order', async ({ page }) => {
  test.setTimeout(240_000);
  const target = assertE2ESupabaseApiTarget();
  const admin = createClient(target.projectUrl, target.serviceRoleKey, { auth: { persistSession: false } });
  let owner;
  let other;
  let interrupt;
  const cacheKey = `rollout-${randomUUID()}`;
  const oldCacheKeys = [`${cacheKey}-a`, `${cacheKey}-b`];
  let failure;
  try {
    // Fail rather than accidentally testing the same schema twice.
    const markerProbe = await admin.from('profiles').select('data_deletion_generation').limit(1);
    if (newApp) expect(['42703', 'PGRST204']).toContain(markerProbe.error?.code);
    else {
      expect(markerProbe.error).toBeNull();
      const flags = await admin.from('data_deletion_safety_config').select('enforce_legacy_fence,sweep_enabled').eq('singleton', true).single();
      expect(flags.error).toBeNull();
      expect(flags.data).toEqual({ enforce_legacy_fence: false, sweep_enabled: false });
    }

    owner = await createTestUser(admin, `rollout-${pair}-owner`);
    other = await createTestUser(admin, `rollout-${pair}-other`);
    const issue = `${owner.id}/rollout-screenshot.png`;
    const audio = `${owner.id}/week-speaking/rollout-recording.webm`;
    const otherIssue = `${other.id}/rollout-other.png`;
    for (const [bucket, key, bytes, contentType] of [
      ['issue-attachments', issue, png, 'image/png'],
      ['speaking-recordings', audio, new Uint8Array([1, 2, 3]), 'audio/webm'],
      ['issue-attachments', otherIssue, png, 'image/png'],
    ]) {
      const uploaded = await admin.storage.from(bucket).upload(key, bytes, { contentType, upsert: false });
      if (uploaded.error) throw uploaded.error;
    }
    const reports = await admin.from('issue_reports').insert([
      { user_id: owner.id, type: 'feedback', message: 'Synthetic rollout owner', page_url: '/week/1', screenshot_path: issue },
      { user_id: other.id, type: 'feedback', message: 'Synthetic rollout other', page_url: '/week/1', screenshot_path: otherIssue },
    ]);
    if (reports.error) throw reports.error;
    const attempt = await admin.from('week_speaking_attempts').insert({
      id: randomUUID(), user_id: owner.id, week_number: 1, first_recording_path: audio,
    });
    if (attempt.error) throw attempt.error;
    const cacheRows = newApp ? oldCacheKeys.map((key) => ({ cache_key: key, endpoint: 'writing', model: 'synthetic', response: { test: true } }))
      : [owner, other].map((user) => ({ cache_key: `${user.id}:${cacheKey}`, cache_owner_id: user.id,
        endpoint: 'writing', model: 'synthetic', response: { test: true } }));
    const seededCache = await admin.from('ai_evaluation_cache').insert(cacheRows);
    if (seededCache.error) throw seededCache.error;
    let before;
    if (oldApp) {
      before = await admin.from('profiles').select('data_deletion_generation').eq('id', owner.id).single();
      if (before.error || !before.data?.data_deletion_generation) throw before.error || new Error('Missing starting generation');
    }

    await signInExistingLearner(page, owner);
    await page.goto('/privacy');
    const confirm = async () => {
      await page.getByRole('button', { name: 'Delete my learning data & recordings' }).click();
      await page.getByPlaceholder('DELETE').fill('DELETE');
      await page.getByRole('button', { name: 'Confirm erasure' }).click();
    };
    let receipt;
    if (newApp) {
      // On the real 0080 schema, interrupt only finish after the durable begin.
      // A weekly upload reservation must be rejected until the retry completes.
      interrupt = (route) => route.request().postDataJSON()?.phase === 'finish'
        ? route.fulfill({ status: 503, json: { error: 'Synthetic rollout interruption.' } }) : route.continue();
      await page.route('**/api/account/delete-data', interrupt);
      await confirm();
      await expect(page.getByText('Synthetic rollout interruption.')).toBeVisible();
      receipt = await page.evaluate((id) => localStorage.getItem(`learning-data-deletion:${id}`), owner.id);
      expect(receipt).toBeTruthy();
      const lock = await admin.from('week_speaking_deletion_locks').select('expires_at').eq('user_id', owner.id).single();
      expect(lock.error).toBeNull();
      expect(new Date(lock.data.expires_at).getUTCFullYear()).toBeGreaterThanOrEqual(6000);
      const blocked = await admin.rpc('reserve_week_speaking_take', {
        p_user_id: owner.id, p_week_number: 1, p_take_id: randomUUID(), p_kind: 'first',
        p_extension: 'webm', p_notes: [], p_phrases: [], p_source_take_id: null,
      });
      expect(blocked.error).toBeTruthy();
      expect((await admin.storage.from('speaking-recordings').download(audio)).error).toBeNull();
      await page.unroute('**/api/account/delete-data', interrupt);
      interrupt = undefined;
      await page.reload();
      await confirm();
      await expect(page.getByText('Your learning data and recordings have been deleted.')).toBeVisible();
    } else {
      // The archived old application still sends its original one-step request.
      await confirm();
      await expect(page.getByText(/All learning data and \d+ audio recordings deleted\./)).toBeVisible();
    }

    expect((await admin.storage.from('issue-attachments').download(issue)).error).toBeTruthy();
    expect((await admin.storage.from('speaking-recordings').download(audio)).error).toBeTruthy();
    expect((await admin.storage.from('issue-attachments').download(otherIssue)).error).toBeNull();
    const ownReports = await admin.from('issue_reports').select('id').eq('user_id', owner.id);
    const otherReports = await admin.from('issue_reports').select('id').eq('user_id', other.id);
    expect(ownReports.error).toBeNull(); expect(ownReports.data).toHaveLength(0);
    expect(otherReports.error).toBeNull(); expect(otherReports.data).toHaveLength(1);
    const cleared = await admin.from('week_speaking_deletion_locks').select('user_id').eq('user_id', owner.id).maybeSingle();
    expect(cleared.error).toBeNull(); expect(cleared.data).toBeNull();
    if (newApp) {
      const cache = await admin.from('ai_evaluation_cache').select('cache_key').in('cache_key', oldCacheKeys);
      expect(cache.error).toBeNull(); expect(cache.data).toHaveLength(0);
      const fresh = await admin.from('issue_reports').insert({ user_id: owner.id, type: 'feedback', message: 'Synthetic later work', page_url: '/week/1' });
      if (fresh.error) throw fresh.error;
      const duplicate = await page.request.post('/api/account/delete-data', { data: { confirm: 'DELETE', phase: 'finish', receipt } });
      expect(duplicate.status()).toBe(200);
      expect((await duplicate.json()).alreadyCompleted).toBe(true);
      const later = await admin.from('issue_reports').select('id').eq('user_id', owner.id);
      expect(later.error).toBeNull(); expect(later.data).toHaveLength(1);
    } else {
      const after = await admin.from('profiles').select('data_deletion_generation,data_deletion_completed_at').eq('id', owner.id).single();
      expect(after.error).toBeNull();
      expect(after.data.data_deletion_generation).not.toBe(before.data.data_deletion_generation);
      expect(after.data.data_deletion_completed_at).toBeTruthy();
      const cache = await admin.from('ai_evaluation_cache').select('cache_owner_id').in('cache_key', cacheRows.map((row) => row.cache_key));
      expect(cache.error).toBeNull(); expect(cache.data).toEqual([{ cache_owner_id: other.id }]);
    }
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    if (interrupt) await page.unroute('**/api/account/delete-data', interrupt).catch(() => {});
    const failures = [];
    // Only disposable, positively identified fixtures in the isolated project
    // may have their pending barriers removed directly for test cleanup.
    if (owner) {
      const unlocked = await admin.from('week_speaking_deletion_locks').delete().eq('user_id', owner.id);
      if (unlocked.error) failures.push(unlocked.error);
    }
    if (newApp) {
      const cache = await admin.from('ai_evaluation_cache').delete().in('cache_key', oldCacheKeys);
      if (cache.error) failures.push(cache.error);
    }
    for (const user of [owner, other]) if (user) {
      try { await deleteTestUser(admin, user.id, { strict: true }); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failure ? [failure, ...failures] : failures, 'Could not clean the isolated rollout fixtures');
  }
});

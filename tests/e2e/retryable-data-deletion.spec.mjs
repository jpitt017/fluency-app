import { test, expect } from './helpers/isolated-test.mjs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { assertE2ESupabaseApiTarget } from '../../scripts/assert-e2e-supabase-target.mjs';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';
import { canUseReadingGateFixture, signInExistingLearner } from './helpers/reading-gate.mjs';

const canUseFixture = Boolean(process.env.E2E_SUPABASE_URL && process.env.E2E_SUPABASE_SERVICE_ROLE_KEY && canUseReadingGateFixture);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/** Real app + isolated Storage/DB, with one browser-side interruption. */
test('a real pending deletion resumes after reload and its receipt preserves later work', async ({ page }) => {
  test.skip(!canUseFixture, 'Requires the pinned isolated E2E Supabase project.');
  test.setTimeout(180_000);
  const target = assertE2ESupabaseApiTarget();
  const admin = createClient(target.projectUrl, target.serviceRoleKey, { auth: { persistSession: false } });
  let owner;
  let other;
  let interrupt;
  try {
    owner = await createTestUser(admin, 'retry-delete-owner');
    other = await createTestUser(admin, 'retry-delete-other');
    const ownerIssue = `${owner.id}/old-screenshot.png`;
    const ownerAudio = `${owner.id}/old-recording.webm`;
    const otherIssue = `${other.id}/other-screenshot.png`;
    for (const [bucket, path, bytes, contentType] of [
      ['issue-attachments', ownerIssue, png, 'image/png'],
      ['speaking-recordings', ownerAudio, new Uint8Array([1, 2, 3]), 'audio/webm'],
      ['issue-attachments', otherIssue, png, 'image/png'],
    ]) {
      const upload = await admin.storage.from(bucket).upload(path, bytes, { contentType, upsert: false });
      if (upload.error) throw upload.error;
    }
    const seeded = await admin.from('issue_reports').insert([
      { user_id: owner.id, type: 'feedback', message: 'Synthetic owner report', page_url: '/week/1', screenshot_path: ownerIssue },
      { user_id: other.id, type: 'feedback', message: 'Synthetic other report', page_url: '/week/1', screenshot_path: otherIssue },
    ]);
    if (seeded.error) throw seeded.error;
    const before = await admin.from('profiles').select('data_deletion_generation').eq('id', owner.id).single();
    if (before.error || !before.data?.data_deletion_generation) throw before.error || new Error('Missing initial deletion generation');
    await signInExistingLearner(page, owner);
    await page.goto('/privacy');

    // The server really creates the durable job; only the first finish request
    // is interrupted in the browser, so it cannot reach or delete from Storage.
    interrupt = (route) => {
      const body = route.request().postDataJSON();
      if (body?.phase === 'finish') return route.fulfill({ status: 503, json: { error: 'Synthetic interruption; please retry.' } });
      return route.continue();
    };
    await page.route('**/api/account/delete-data', interrupt);
    const confirm = async () => {
      await page.getByRole('button', { name: 'Delete my learning data & recordings' }).click();
      await page.getByPlaceholder('DELETE').fill('DELETE');
      await page.getByRole('button', { name: 'Confirm erasure' }).click();
    };
    await confirm();
    await expect(page.getByText('Synthetic interruption; please retry.')).toBeVisible();
    const receiptKey = `learning-data-deletion:${owner.id}`;
    const receipt = await page.evaluate((key) => window.localStorage.getItem(key), receiptKey);
    expect(receipt).toBeTruthy();
    const pending = await admin.from('week_speaking_deletion_locks').select('expires_at').eq('user_id', owner.id).single();
    expect(pending.error).toBeNull();
    expect(new Date(pending.data.expires_at).getUTCFullYear()).toBeGreaterThanOrEqual(6000);
    expect((await admin.storage.from('issue-attachments').download(ownerIssue)).error).toBeNull();
    expect((await admin.storage.from('speaking-recordings').download(ownerAudio)).error).toBeNull();
    const blocked = await admin.from('issue_reports').insert({ user_id: owner.id, type: 'feedback', message: 'Blocked during deletion', page_url: '/week/1' });
    expect(blocked.error).toBeTruthy();

    await page.unroute('**/api/account/delete-data', interrupt);
    interrupt = undefined;
    await page.reload();
    await confirm();
    await expect(page.getByText('Your learning data and recordings have been deleted.')).toBeVisible();
    expect(await page.evaluate((key) => window.localStorage.getItem(key), receiptKey)).toBeNull();
    expect((await admin.storage.from('issue-attachments').download(ownerIssue)).error).toBeTruthy();
    expect((await admin.storage.from('speaking-recordings').download(ownerAudio)).error).toBeTruthy();
    expect((await admin.storage.from('issue-attachments').download(otherIssue)).error).toBeNull();
    const oldRows = await admin.from('issue_reports').select('id').eq('user_id', owner.id);
    expect(oldRows.error).toBeNull();
    expect(oldRows.data).toHaveLength(0);
    const otherRows = await admin.from('issue_reports').select('id').eq('user_id', other.id);
    expect(otherRows.error).toBeNull();
    expect(otherRows.data).toHaveLength(1);
    const cleared = await admin.from('week_speaking_deletion_locks').select('user_id').eq('user_id', owner.id).maybeSingle();
    expect(cleared.error).toBeNull();
    expect(cleared.data).toBeNull();

    // A lost/duplicate completion response must not start another deletion.
    const profile = await admin.from('profiles').select('data_deletion_generation').eq('id', owner.id).single();
    if (profile.error || !profile.data?.data_deletion_generation) throw profile.error || new Error('Missing deletion generation');
    expect(profile.data.data_deletion_generation).not.toBe(before.data.data_deletion_generation);
    const fresh = `${owner.id}/deletion-v1/${profile.data.data_deletion_generation}/${randomUUID()}-screenshot`;
    const uploadFresh = await admin.storage.from('issue-attachments').upload(fresh, png, { contentType: 'image/png', upsert: false });
    if (uploadFresh.error) throw uploadFresh.error;
    const freshRow = await admin.from('issue_reports').insert({ user_id: owner.id, type: 'feedback', message: 'Synthetic new work', page_url: '/week/1',
      screenshot_path: fresh, data_deletion_generation: profile.data.data_deletion_generation });
    if (freshRow.error) throw freshRow.error;
    const duplicate = await page.request.post('/api/account/delete-data', { data: { confirm: 'DELETE', phase: 'finish', receipt } });
    expect(duplicate.status()).toBe(200);
    expect((await duplicate.json()).alreadyCompleted).toBe(true);
    expect((await admin.storage.from('issue-attachments').download(fresh)).error).toBeNull();
    const freshRows = await admin.from('issue_reports').select('id').eq('user_id', owner.id);
    expect(freshRows.error).toBeNull();
    expect(freshRows.data).toHaveLength(1);
  } finally {
    if (interrupt) await page.unroute('**/api/account/delete-data', interrupt);
    const failures = [];
    // If an assertion failed after begin, release only this disposable user's
    // barrier so strict fixture cleanup can remove its rows and private files.
    if (owner) {
      const unlocked = await admin.from('week_speaking_deletion_locks').delete().eq('user_id', owner.id);
      if (unlocked.error) failures.push(unlocked.error);
    }
    for (const user of [owner, other]) {
      if (!user) continue;
      try { await deleteTestUser(admin, user.id); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, 'Could not clean isolated deletion fixtures');
  }
});

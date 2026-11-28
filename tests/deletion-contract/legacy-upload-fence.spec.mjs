import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { test, expect } from '../e2e/helpers/isolated-test.mjs';
import { signInExistingLearner } from '../e2e/helpers/reading-gate.mjs';
import { assertE2ESupabaseApiTarget } from '../../scripts/assert-e2e-supabase-target.mjs';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';

const notes = JSON.parse(readFileSync('supabase-b1-b2/content/curriculum/speaking-support-weeks-01-04.json', 'utf8'))
  .weeks[0].planNotes.map((label) => ({ label, note: '' }));
const audio = new Uint8Array([1, 2, 3, 4]);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

async function postFromBrowser(page, endpoint, { explicit = false, includeAudio = true } = {}) {
  return page.evaluate(async ({ endpoint, explicit, includeAudio, notes }) => {
    const cookie = document.cookie.split('; ').find((item) => item.startsWith('fluency-data-generation='));
    const generation = cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')).split('.')[1] : '';
    if (explicit && !generation) throw new Error('The current page did not get a deletion generation');
    const body = new FormData();
    if (endpoint === '/api/week/speaking/capture') {
      body.set('weekNumber', '1'); body.set('kind', 'first');
      body.set('notes', JSON.stringify(notes)); body.set('phrases', '[]');
    } else if (endpoint === '/api/issues') {
      body.set('type', 'feedback'); body.set('mode', 'text'); body.set('message', 'Synthetic contract report');
      body.set('page', location.origin + '/week/1');
      body.set('screenshot', new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }), 'test.png');
    }
    if (includeAudio && endpoint !== '/api/issues') body.set('audio', new Blob(['synthetic'], { type: 'audio/webm' }), 'test.webm');
    if (!includeAudio) body.set('fixture', 'no audio');
    const response = await fetch(endpoint, { method: 'POST', body,
      headers: explicit ? { 'x-fluency-data-generation': generation } : {} });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { endpoint, explicit, includeAudio, notes });
}

// This test never targets production. It checks the real Storage service and
// the built app for both a never-deleted and a previously deleted account.
// The global flag is reset even on failure; CI holds the isolated-project lock.
test('contract fence blocks old servers, stale tabs, direct and signed uploads for every account', async ({ page }) => {
  test.setTimeout(240_000);
  if (process.env.E2E_TAG_TEST_USERS !== 'true') throw new Error('Contract fixtures must be tagged for isolated cleanup');
  const target = assertE2ESupabaseApiTarget();
  const admin = createClient(target.projectUrl, target.serviceRoleKey, { auth: { persistSession: false } });
  const fixtures = [];
  let resetFence = false;
  let failure;
  const cleanupErrors = [];
  try {
    const flags = await admin.from('data_deletion_safety_config').select('enforce_legacy_fence,sweep_enabled').eq('singleton', true).single();
    if (flags.error || flags.data?.enforce_legacy_fence !== false || flags.data?.sweep_enabled !== false) {
      throw new Error('The isolated contract must begin with both flags off');
    }
    for (const deleted of [false, true]) {
      const user = await createTestUser(admin, deleted ? 'fence-deleted' : 'fence-never-deleted');
      const fixture = { user, deleted };
      fixtures.push(fixture);
      if (deleted) {
        const token = randomUUID();
        const began = await admin.rpc('begin_week_speaking_deletion', { p_user_id: user.id, p_lock_id: token });
        if (began.error || began.data !== true) throw began.error || new Error('Could not begin fixture deletion');
        const finished = await admin.rpc('finish_week_speaking_deletion', { p_user_id: user.id, p_lock_id: token });
        if (finished.error || finished.data?.deleted !== true) throw finished.error || new Error('Could not finish fixture deletion');
      }
      const profile = await admin.from('profiles').select('data_deletion_generation,data_deletion_completed_at').eq('id', user.id).single();
      if (profile.error || !profile.data?.data_deletion_generation
          || Boolean(profile.data.data_deletion_completed_at) !== deleted) throw profile.error || new Error('Wrong fixture deletion state');
      fixture.generation = profile.data.data_deletion_generation;
      fixture.client = createClient(target.projectUrl, target.anonKey, { auth: { persistSession: false } });
      const signedIn = await fixture.client.auth.signInWithPassword({ email: user.email, password: user.password });
      if (signedIn.error) throw signedIn.error;

      // Demonstrate the old direct policy and a signed URL really work before
      // activation. Afterward, these same legacy shapes must fail.
      const baseline = `${user.id}/baseline-${randomUUID()}.webm`;
      const direct = await fixture.client.storage.from('speaking-recordings').upload(baseline, audio, { contentType: 'audio/webm', upsert: false });
      if (direct.error) throw direct.error;
      const removed = await admin.storage.from('speaking-recordings').remove([baseline]);
      if (removed.error) throw removed.error;
      const signedBaseline = `${user.id}/signed-baseline-${randomUUID()}.webm`;
      const baselineUrl = await fixture.client.storage.from('speaking-recordings').createSignedUploadUrl(signedBaseline);
      if (baselineUrl.error || !baselineUrl.data?.token) throw baselineUrl.error || new Error('Could not sign baseline upload');
      const baselineUpload = await fixture.client.storage.from('speaking-recordings').uploadToSignedUrl(signedBaseline, baselineUrl.data.token, audio, { contentType: 'audio/webm' });
      if (baselineUpload.error) throw baselineUpload.error;
      const removedSigned = await admin.storage.from('speaking-recordings').remove([signedBaseline]);
      if (removedSigned.error) throw removedSigned.error;

      fixture.takeId = randomUUID();
      const reservation = await admin.rpc('reserve_week_speaking_take', { p_user_id: user.id, p_week_number: 1,
        p_take_id: fixture.takeId, p_kind: 'first', p_extension: 'webm', p_notes: [], p_phrases: [], p_source_take_id: null });
      if (reservation.error || !reservation.data?.path) throw reservation.error || new Error('Could not reserve old-app fixture');
      fixture.takePath = reservation.data.path;
      const signed = await fixture.client.storage.from('speaking-recordings').createSignedUploadUrl(fixture.takePath);
      if (signed.error || !signed.data?.token) throw signed.error || new Error('Could not create pre-fence signed upload');
      fixture.signedToken = signed.data.token;
      fixture.signedIssuePath = `${user.id}/deletion-v1/${fixture.generation}/${randomUUID()}-screenshot`;
      const signedIssue = await admin.storage.from('issue-attachments').createSignedUploadUrl(fixture.signedIssuePath);
      if (signedIssue.error || !signedIssue.data?.token) throw signedIssue.error || new Error('Could not create pre-fence signed attachment');
      fixture.signedIssueToken = signedIssue.data.token;
    }

    // From here all writes are synthetic, on the pinned isolated project only.
    resetFence = true; // also reset after an ambiguous update response
    const enabled = await admin.from('data_deletion_safety_config').update({ enforce_legacy_fence: true }).eq('singleton', true)
      .select('enforce_legacy_fence,sweep_enabled').single();
    if (enabled.error || enabled.data?.enforce_legacy_fence !== true || enabled.data?.sweep_enabled !== false) {
      throw enabled.error || new Error('Could not activate the isolated contract fence');
    }

    for (const fixture of fixtures) {
      const { user, generation, client, takePath, takeId } = fixture;
      const legacyIssue = `${user.id}/old-${randomUUID()}.png`;
      const legacyAudio = `${user.id}/old-${randomUUID()}.webm`;
      const taggedLegacyIssue = `${user.id}/deletion-v1/${generation}/${randomUUID()}-screenshot`;
      const oldIssue = await admin.storage.from('issue-attachments').upload(legacyIssue, png, { contentType: 'image/png', upsert: false });
      expect(oldIssue.error, 'old server issue attachment').toBeTruthy();
      const oldArbitrary = await client.storage.from('speaking-recordings').upload(legacyAudio, audio, { contentType: 'audio/webm', upsert: false });
      expect(oldArbitrary.error, 'old direct recording').toBeTruthy();
      const oldWeekly = await admin.storage.from('speaking-recordings').upload(takePath, audio, { contentType: 'audio/webm', upsert: false });
      expect(oldWeekly.error, 'old server with a live reservation').toBeTruthy();
      const taggedLegacy = await admin.storage.from('issue-attachments').upload(taggedLegacyIssue, png,
        { contentType: 'image/png', upsert: false, metadata: { data_deletion_client: 'legacy' } });
      expect(taggedLegacy.error, 'old browser request begun before fence').toBeTruthy();
      const inFlight = await admin.storage.from('speaking-recordings').upload(takePath, audio, { contentType: 'audio/webm', upsert: false,
        metadata: { data_deletion_generation: generation, data_deletion_client: 'legacy' } });
      expect(inFlight.error, 'old browser recording begun before fence').toBeTruthy();
      const forged = await client.storage.from('speaking-recordings').upload(takePath, audio, { contentType: 'audio/webm', upsert: false,
        metadata: { data_deletion_generation: generation, data_deletion_client: 'v1' } });
      expect(forged.error, 'direct client with current metadata and reservation').toBeTruthy();
      const oldSigned = await client.storage.from('speaking-recordings').uploadToSignedUrl(takePath, fixture.signedToken, audio,
        { contentType: 'audio/webm', metadata: { data_deletion_generation: generation, data_deletion_client: 'v1' } });
      expect(oldSigned.error, 'pre-fence signed recording with current metadata').toBeTruthy();
      const oldSignedIssue = await client.storage.from('issue-attachments').uploadToSignedUrl(fixture.signedIssuePath, fixture.signedIssueToken, png,
        { contentType: 'image/png', metadata: { data_deletion_client: 'v1' } });
      expect(oldSignedIssue.error, 'pre-fence service-signed attachment').toBeTruthy();
      expect((await admin.storage.from('speaking-recordings').download(takePath)).error).toBeTruthy();
      expect((await admin.storage.from('issue-attachments').download(fixture.signedIssuePath)).error).toBeTruthy();

      // The same reservation and metadata succeed through the current server's
      // ordinary non-overwriting Storage POST, proving failures weren't just a
      // broken reservation or bucket. Close and remove this synthetic probe.
      const current = await admin.storage.from('speaking-recordings').upload(takePath, audio, { contentType: 'audio/webm', upsert: false,
        metadata: { data_deletion_generation: generation, data_deletion_client: 'v1' } });
      if (current.error) throw new Error(`Current service upload failed: ${current.error.message}`);
      const closed = await admin.rpc('finish_week_speaking_upload', { p_user_id: user.id, p_take_id: takeId, p_success: false });
      if (closed.error || closed.data !== true) throw closed.error || new Error('Could not close contract reservation');
      const removed = await admin.storage.from('speaking-recordings').remove([takePath]);
      if (removed.error) throw removed.error;

      // Copy/move run through different Storage endpoints and may preserve
      // user_metadata. Even a privileged API request must not create a new
      // protected key that bypasses the supported ordinary upload path.
      const source = `${user.id}/deletion-v1/${generation}/${randomUUID()}-source`;
      const destination = `${user.id}/deletion-v1/${generation}/${randomUUID()}-copy`;
      const movedPath = `${user.id}/deletion-v1/${generation}/${randomUUID()}-moved`;
      const sourceUpload = await admin.storage.from('issue-attachments').upload(source, png,
        { contentType: 'image/png', upsert: false, metadata: { data_deletion_client: 'v1' } });
      if (sourceUpload.error) throw new Error(`Current attachment upload failed: ${sourceUpload.error.message}`);
      expect((await admin.storage.from('issue-attachments').copy(source, destination)).error, 'copy to a protected key').toBeTruthy();
      expect((await admin.storage.from('issue-attachments').move(source, movedPath)).error, 'move to a protected key').toBeTruthy();
      expect((await admin.storage.from('issue-attachments').download(source)).error).toBeNull();
      expect((await admin.storage.from('issue-attachments').download(destination)).error).toBeTruthy();
      expect((await admin.storage.from('issue-attachments').download(movedPath)).error).toBeTruthy();
      const removedSource = await admin.storage.from('issue-attachments').remove([source]);
      if (removedSource.error) throw removedSource.error;

      await page.context().clearCookies();
      await signInExistingLearner(page, user);
      if (process.env.E2E_OLD_APP_DIR) {
        // CI also starts the actual archived old server. Its unchanged saved
        // upload handlers must fail on the fenced schema, even while reachable.
        // Its transient AI routes have no such gate: retirement/draining that
        // server remains an essential operational prerequisite.
        await page.goto('http://127.0.0.1:3001/week/1');
        for (const endpoint of ['/api/week/speaking/capture', '/api/issues']) {
          expect((await postFromBrowser(page, endpoint)).status, `archived old server at ${endpoint}`).toBe(503);
        }
        expect((await postFromBrowser(page, '/api/speaking/evaluate', { includeAudio: false })).status).toBe(400);
        const oldTranscribe = await postFromBrowser(page, '/api/speaking/transcribe', { includeAudio: false });
        // The old server has no upload gate. For a never-deleted account it
        // reaches validation; a deleted account's quota-row generation guard
        // may instead reject the old request before validation.
        expect(oldTranscribe.status).toBe(fixture.deleted ? 503 : 400);
      }
      await page.goto('http://127.0.0.1:3000/week/1'); // fresh shared cookie, even for an old tab
      for (const endpoint of ['/api/week/speaking/capture', '/api/issues']) {
        expect((await postFromBrowser(page, endpoint)).status, `stale browser at ${endpoint}`).toBe(503);
      }
      for (const endpoint of ['/api/speaking/evaluate', '/api/speaking/transcribe']) {
        expect((await postFromBrowser(page, endpoint)).status, `stale transient audio at ${endpoint}`).toBe(409);
        expect((await postFromBrowser(page, endpoint, { explicit: true, includeAudio: false })).status,
          `current transient endpoint at ${endpoint}`).toBe(400);
      }
      const first = await postFromBrowser(page, '/api/week/speaking/capture', { explicit: true });
      const second = await postFromBrowser(page, '/api/week/speaking/capture', { explicit: true });
      expect(first.status, JSON.stringify(first.body)).toBe(200);
      expect(second.status, JSON.stringify(second.body)).toBe(200);
      expect(first.body.takeId).toMatch(/^f[0-9a-f]{7}-[0-9a-f]{4}-8[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(second.body.takeId).toMatch(/^f[0-9a-f]{7}-[0-9a-f]{4}-8[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(first.body.takeId).not.toBe(second.body.takeId);
      const rows = await admin.from('week_speaking_takes').select('id,recording_path,status').eq('user_id', user.id)
        .in('id', [first.body.takeId, second.body.takeId]);
      if (rows.error) throw rows.error;
      expect(rows.data).toHaveLength(2);
      expect(new Set(rows.data.map((row) => row.recording_path)).size).toBe(2);
      expect(rows.data.every((row) => row.status === 'ready')).toBe(true);
      for (const row of rows.data) expect((await admin.storage.from('speaking-recordings').download(row.recording_path)).error).toBeNull();
      const issue = await postFromBrowser(page, '/api/issues', { explicit: true });
      expect(issue.status, JSON.stringify(issue.body)).toBe(201);
      const reports = await admin.from('issue_reports').select('screenshot_path,data_deletion_generation').eq('user_id', user.id);
      if (reports.error) throw reports.error;
      expect(reports.data).toHaveLength(1);
      expect(reports.data[0].screenshot_path).toMatch(new RegExp(`^${user.id}/deletion-v1/${generation}/`));
      expect(reports.data[0].data_deletion_generation).toBe(generation);
      expect((await admin.storage.from('issue-attachments').download(reports.data[0].screenshot_path)).error).toBeNull();
    }
  } catch (error) {
    failure = error;
  } finally {
    if (resetFence) {
      const reset = await admin.from('data_deletion_safety_config').update({ enforce_legacy_fence: false }).eq('singleton', true)
        .select('enforce_legacy_fence').single();
      if (reset.error || reset.data?.enforce_legacy_fence !== false) cleanupErrors.push(reset.error || new Error('Could not restore isolated fence'));
    }
    for (const { user } of fixtures) {
      try {
        const unlocked = await admin.from('week_speaking_deletion_locks').delete().eq('user_id', user.id);
        if (unlocked.error) throw unlocked.error;
        await deleteTestUser(admin, user.id, { strict: true });
      } catch (error) { cleanupErrors.push(error); }
    }
  }
  if (cleanupErrors.length) throw new AggregateError(failure ? [failure, ...cleanupErrors] : cleanupErrors, 'Isolated contract or cleanup failed');
  if (failure) throw failure;
});

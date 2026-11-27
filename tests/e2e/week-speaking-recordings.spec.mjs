import { expect, test } from './helpers/isolated-test.mjs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { weekSpeakingRecordingPath } from '../../lib/b1b2/week-speaking-recordings.mjs';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';
import { canUseReadingGateFixture, signInExistingLearner } from './helpers/reading-gate.mjs';

const url = process.env.E2E_SUPABASE_URL;
const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const canUseFixture = Boolean(url && key) && canUseReadingGateFixture;

/** Seed two learners' weekly takes with the admin client. No auth email is sent. */
async function fixture({ withTeacher = false } = {}) {
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const learner = await createTestUser(admin, 'week-rec-owner');
  const other = await createTestUser(admin, 'week-rec-other');
  const teacher = withTeacher ? await createTestUser(admin, 'week-rec-teacher') : null;
  const ownerAttemptId = randomUUID();
  const otherAttemptId = randomUUID();
  const ownerTakeId = randomUUID();
  const otherTakeId = randomUUID();
  const ownerPath = weekSpeakingRecordingPath({
    userId: learner.id, weekNumber: 1, attemptId: ownerAttemptId, takeNumber: 1, mimeType: 'audio/webm',
  });
  const otherPath = weekSpeakingRecordingPath({
    userId: other.id, weekNumber: 1, attemptId: otherAttemptId, takeNumber: 1, mimeType: 'audio/webm',
  });
  const ownerTakePath = `${learner.id}/week-speaking/1/${ownerAttemptId}/recording-${ownerTakeId}.webm`;
  const otherTakePath = `${other.id}/week-speaking/1/${otherAttemptId}/recording-${otherTakeId}.webm`;
  const audio = new Blob(['weekly speaking playback fixture'], { type: 'audio/webm' });

  try {
    if (teacher) {
      const teacherRole = await admin.from('profiles').update({ role: 'teacher' }).eq('id', teacher.id).select('id').single();
      if (teacherRole.error || !teacherRole.data) throw new Error(`Could not make teacher fixture staff: ${teacherRole.error?.message}`);
    }
    for (const path of [ownerPath, otherPath]) {
      const upload = await admin.storage.from('speaking-recordings')
        .upload(path, audio, { contentType: 'audio/webm', upsert: true });
      if (upload.error) throw upload.error;
    }
    const saved = await admin.from('week_speaking_attempts').insert([
      {
        id: ownerAttemptId,
        user_id: learner.id,
        week_number: 1,
        notes: [],
        first_recording_path: ownerPath,
        first_transcript: 'A saved first take',
        first_feedback: { summary: 'Good work' },
      },
      {
        id: otherAttemptId,
        user_id: other.id,
        week_number: 1,
        notes: [],
        first_recording_path: otherPath,
        first_transcript: 'Another learner’s take',
        first_feedback: { summary: 'Private' },
      },
    ]);
    if (saved.error) throw saved.error;
    // New keys must have an active database reservation before Storage can
    // create them; this exercises the same guard as the real capture route.
    for (const [user, takeId, path] of [[learner, ownerTakeId, ownerTakePath], [other, otherTakeId, otherTakePath]]) {
      const reserved = await admin.rpc('reserve_week_speaking_take', {
        p_user_id: user.id, p_week_number: 1, p_take_id: takeId, p_kind: 'retry', p_extension: 'webm',
        p_notes: [], p_phrases: [], p_source_take_id: null,
      });
      if (reserved.error || reserved.data?.path !== path) throw reserved.error || new Error('Wrong reserved recording key');
      const uploaded = await admin.storage.from('speaking-recordings').upload(path, audio, { contentType: 'audio/webm', upsert: false });
      if (uploaded.error) throw uploaded.error;
      const finished = await admin.rpc('finish_week_speaking_upload', { p_user_id: user.id, p_take_id: takeId, p_success: true });
      if (finished.error || finished.data !== true) throw finished.error || new Error('Could not finish recording fixture');
    }
    return { admin, learner, other, teacher, ownerAttemptId, otherAttemptId, ownerPath, otherPath, ownerTakeId, otherTakeId, ownerTakePath, otherTakePath };
  } catch (error) {
    for (const user of [teacher, learner, other]) {
      if (user) await deleteTestUser(admin, user.id);
    }
    throw error;
  }
}

async function cleanup(data) {
  if (!data) return;
  for (const user of [data.teacher, data.learner, data.other]) {
    if (user) await deleteTestUser(data.admin, user.id);
  }
}

test('a learner gets a 60-second server link for their own recording, not another learner’s', async ({ page }) => {
  test.skip(!canUseFixture, 'Isolated E2E Supabase admin credentials are unavailable.');
  let data;
  let ownerPage;
  try {
    data = await fixture();
    ownerPage = await page.context().newPage();
    await signInExistingLearner(ownerPage, data.learner);

    const playback = await ownerPage.request.get(`/api/week/speaking/recording/${data.ownerAttemptId}/1`, { maxRedirects: 0 });
    expect(playback.status()).toBe(302);
    expect(playback.headers().location).toMatch(/^https?:\/\//);
    expect(playback.headers().location).toMatch(/token=/);
    expect(playback.headers()['cache-control']).toContain('no-store');

    const foreign = await ownerPage.request.get(`/api/week/speaking/recording/${data.otherAttemptId}/1`, { maxRedirects: 0 });
    expect(foreign.status()).toBe(404);
    const newPlayback = await ownerPage.request.get(`/api/week/speaking/take/${data.ownerTakeId}`, { maxRedirects: 0 });
    expect(newPlayback.status()).toBe(302);
    expect(newPlayback.headers()['cache-control']).toContain('no-store');
    const newForeign = await ownerPage.request.get(`/api/week/speaking/take/${data.otherTakeId}`, { maxRedirects: 0 });
    expect(newForeign.status()).toBe(404);

    const week = await ownerPage.goto('/week/1');
    expect(week?.status()).toBe(200);
    await expect(ownerPage.locator('[data-testid^="week-speaking-recording-"]')).toHaveCount(2);
    const html = await ownerPage.content();
    expect(html).not.toContain(data.ownerPath);
    expect(html).not.toContain(data.otherPath);
    expect(html).not.toContain(data.ownerTakePath);
    expect(html).not.toContain(data.otherTakePath);
    expect(html).not.toContain('token=');
  } finally {
    if (ownerPage) await ownerPage.close();
    await cleanup(data);
  }
});

test('staff can play back another learner’s weekly recording from the teacher view', async ({ page }) => {
  test.skip(!canUseFixture, 'Isolated E2E Supabase admin credentials are unavailable.');
  let data;
  try {
    data = await fixture({ withTeacher: true });
    await signInExistingLearner(page, data.teacher);

    const response = await page.goto('/teacher');
    expect(response?.status()).toBe(200);
    const learnerButton = page.locator('aside button').filter({ hasText: data.learner.email.split('@')[0] }).first();
    await expect(learnerButton).toBeVisible();
    await learnerButton.click();
    await expect(page.getByRole('heading', { name: /Weekly speaking recordings/i })).toBeVisible();

    const playback = await page.request.get(`/api/week/speaking/recording/${data.ownerAttemptId}/1`, { maxRedirects: 0 });
    expect(playback.status()).toBe(302);
    expect(playback.headers().location).toMatch(/token=/);
    const newPlayback = await page.request.get(`/api/week/speaking/take/${data.ownerTakeId}`, { maxRedirects: 0 });
    expect(newPlayback.status()).toBe(302);
    expect(newPlayback.headers().location).toMatch(/token=/);
    const html = await page.content();
    expect(html).not.toContain(data.ownerPath);
    expect(html).not.toContain('token=');
  } finally {
    await cleanup(data);
  }
});

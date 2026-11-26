import { test, expect } from './helpers/isolated-test.mjs';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';

const url = process.env.E2E_SUPABASE_URL;
const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;

test('report button is present on learner and teacher pages', async ({ page }) => {
  for (const path of ['/week/1', '/labs', '/review', '/dashboard', '/teacher']) {
    await page.goto(path);
    await page.getByRole('button', { name: 'Problem? Tell us' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Please sign in to send a report.')).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  }
});

test('learner sends reports with explicit answer consent', async ({ page }) => {
  test.skip(!url || !key, 'Live test needs the service key');
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const user = await createTestUser(admin, 'issue-e2e');
  try {
    const task = await admin.from('writing_tasks').select('id').limit(1).single();
    if (task.error) throw task.error;
    const seeded = await admin.from('writing_submissions').insert({ user_id: user.id, task_id: task.data.id, body: 'An example saved answer for a test.', status: 'draft' });
    if (seeded.error) throw seeded.error;
    await page.goto('/login');
    await page.getByLabel(/Email/i).fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: /Sign in/i }).click();
    await page.waitForURL(/\/dashboard|\/labs/);
    await page.goto('/week/1?private=do-not-save');
    for (const include of [false, true]) {
      await page.getByRole('button', { name: 'Problem? Tell us' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('What would you like to tell us?').selectOption('idea');
      await dialog.getByLabel('Tell us what happened').fill(include ? 'Second test report' : 'First test report');
      if (include) await dialog.getByLabel('Include my last answer').check();
      await dialog.getByRole('button', { name: 'Send report' }).click();
      await expect(dialog.getByText("Thank you! We'll look at this soon.")).toBeVisible();
      await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
    }
    const reports = await admin.from('issue_reports').select('message,last_answer,page_url,current_week,app_version').eq('user_id', user.id).order('created_at');
    if (reports.error) throw reports.error;
    expect(reports.data).toHaveLength(2);
    expect(reports.data[0].last_answer).toBeNull();
    expect(reports.data[1].last_answer).toBe('An example saved answer for a test.');
    expect(reports.data[0].page_url).not.toContain('private=');
    expect(reports.data[0].current_week).toBe(1);

    // Simulate a microphone and verify the UI sends a bounded WAV without study APIs.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
      window.AudioContext = class {
        sampleRate = 16000;
        destination = {};
        createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
        createScriptProcessor() {
          const processor = { onaudioprocess: null, connect() { setTimeout(() => processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(16000).fill(0.1) } }), 0); }, disconnect() {} };
          return processor;
        }
        close() { return Promise.resolve(); }
      };
    });
    let captured = false;
    await page.route('**/api/issues', async route => {
      const payload = route.request().postDataBuffer();
      captured = Boolean(payload?.includes(Buffer.from('RIFF')) && payload.includes(Buffer.from('WAVEfmt ')) && !payload.includes(Buffer.from('An example saved answer')));
      await route.fulfill({ status: 201, json: { ok: true } });
    });
    await page.getByRole('button', { name: 'Problem? Tell us' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Record', { exact: true }).check();
    await dialog.getByRole('button', { name: 'Start recording' }).click();
    await expect(dialog.getByRole('button', { name: 'Stop recording' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Stop recording' }).click();
    await expect(dialog.getByText('Your recording is ready.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Send report' }).click();
    await expect(dialog.getByText("Thank you! We'll look at this soon.")).toBeVisible();
    expect(captured).toBe(true);
  } finally {
    await deleteTestUser(admin, user.id);
  }
});

import { test, expect } from './helpers/isolated-test.mjs';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';

const details = JSON.parse(readFileSync(new URL('../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json', import.meta.url)));

const url = process.env.E2E_SUPABASE_URL;
const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;

test('the dashboard reload reflects completion records for all six weekly tasks', async ({ page }) => {
  test.skip(!url || !key, 'Live test needs the isolated E2E service key');
  test.setTimeout(180_000);
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const user = await createTestUser(admin, 'dashboard-week-progress');
  try {
    // Seed the exact server-side records each completed task leaves behind;
    // the page must derive its display from those rows after a fresh request.
    const writes = await Promise.all([
      admin.from('week_skill_completions').insert([
        { user_id: user.id, week_number: 1, skill: 'grammar', answered: 1, correct: 1, total: 1 },
        { user_id: user.id, week_number: 1, skill: 'vocabulary', answered: 1, correct: 1, total: 1 },
      ]),
      admin.from('week_input_submissions').insert([
        { user_id: user.id, week_number: 1, skill: 'reading' },
        { user_id: user.id, week_number: 1, skill: 'listening' },
      ]),
      admin.from('week_input_answers').insert(['reading', 'listening'].flatMap((skill) =>
        details[skill].weeks[0].questions.map((question) => ({
          user_id: user.id, week_number: 1, skill, item_id: question.id, answer: 'saved', correct: true,
        })),
      )),
      admin.from('week_speaking_attempts').insert({
        id: crypto.randomUUID(), user_id: user.id, week_number: 1, first_recording_path: `${user.id}/week-1/first.webm`,
      }),
      admin.from('week_output_submissions').insert({ user_id: user.id, week_number: 1, skill: 'writing' }),
    ]);
    for (const result of writes) if (result.error) throw result.error;

    await page.goto('/login');
    await page.getByLabel(/Email/i).fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: /Sign in/i }).click();
    await page.waitForURL(/\/dashboard|\/labs/, { timeout: 60_000 });
    await page.goto('/dashboard');
    await page.reload();

    await expect(page.getByText('6 of 6 tasks done')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: "This week's task progress" })).toHaveAttribute('aria-valuenow', '6');
    for (const task of ['Grammar', 'Vocabulary', 'Reading', 'Listening', 'Speaking', 'Writing']) {
      const link = page.getByRole('link', { name: new RegExp(`^${task}\\b`) });
      await expect(link).toBeVisible();
      await expect(link).toContainText('✓');
    }
    await expect(page.getByText(/cards due today · \d+ cards finished/)).toBeVisible();
  } finally {
    await deleteTestUser(admin, user.id);
  }
});

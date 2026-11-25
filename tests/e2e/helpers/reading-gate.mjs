import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../../../scripts/lib/test-user.mjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const details = JSON.parse(readFileSync(new URL('../../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json', import.meta.url), 'utf8'));

export const canUseReadingGateFixture = Boolean(url && key);

/** Create a confirmed test learner and sign in without sending auth email. */
export async function createReadingLearner(page, prefix) {
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const user = await createTestUser(admin, prefix);
  try {
    await page.goto('/login');
    await page.getByLabel(/Email/i).fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: /Sign in/i }).click();
    await page.waitForURL(/\/dashboard|\/labs/, { timeout: 60_000 });
    return { admin, user };
  } catch (error) {
    await deleteTestUser(admin, user.id);
    throw error;
  }
}

/** Mark every existing reading question through its server route, then finish. */
export async function answerReadingAndFinish(page, week = 1) {
  const questions = details.reading.weeks.find((entry) => entry.week === week)?.questions ?? [];
  for (const question of questions) {
    const answer = question.options?.[0] ?? question.key;
    const response = await page.request.post('/api/week/input/mark', {
      data: { week, skill: 'reading', id: question.id, answer },
    });
    if (!response.ok()) throw new Error(`Could not mark reading question ${question.id}: ${response.status()} ${(await response.text()).slice(0, 300)}`);
  }
  const finish = await page.request.post('/api/week/input', { data: { week, skill: 'reading' } });
  if (!finish.ok()) throw new Error(`Could not finish reading: ${finish.status()} ${(await finish.text()).slice(0, 300)}`);
}

export async function removeReadingLearner(admin, user) {
  if (admin && user) await deleteTestUser(admin, user.id);
}

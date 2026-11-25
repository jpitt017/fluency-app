import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';

const bank = JSON.parse(readFileSync(new URL('../fixtures/placement-questions-v2.json', import.meta.url)));
const details = JSON.parse(readFileSync(new URL('../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json', import.meta.url)));

test('learner week 1 renders safe content and opens the weekly practice task', async ({ page }) => {
  const response = await page.goto('/week/1');
  expect(response?.status()).toBe(200);
  await expect(page.getByText('By the end of this week I can…', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Reading:/ })).toBeVisible();
  // Listening audio depends on the approval flag in `listening_audio_trials`:
  // an unreleased week says "Audio coming soon."; an approved AI trial week
  // shows the player, always labelled as a trial recording.
  const audioComingSoon = page.getByText('Audio coming soon.');
  const trialPlayer = page.getByText('AI voice – trial recording');
  await expect(audioComingSoon.or(trialPlayer)).toBeVisible();
  await expect(page.getByText(details.weeks[0].speaking.cueCard)).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain('"answer_index"');
  expect(html).not.toContain('"accepted"');
  expect(html).not.toContain('"reason"');
  // The first speaking model and focus question stay server-gated until a
  // saved first recording; the writing model and answer keys remain hidden too.
  await expect(page.getByRole('heading', { name: '1. Plan · about 2 minutes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Speaking: model answer' })).toHaveCount(0);
  expect(html).not.toContain(details.weeks[0].speaking.model);
  expect(html).not.toContain(details.weeks[0].writing.modelAnswer);
  await page.getByRole('link', { name: 'Start writing task' }).click();
  await expect(page).toHaveURL(/\/labs\?week=1#writing/);
  // The way back is on screen at the task itself (the #writing anchor scrolls
  // past the page header), and the task counts for the week.
  const writingSection = page.locator('#writing');
  const back = writingSection.getByRole('link', { name: '← Back to Week 1' });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute('href', '/week/1');
  await expect(writingSection.getByText('This task counts for Week 1.')).toBeVisible();
  const signInHref = await page.getByRole('link', { name: 'Sign in for AI feedback →' }).getAttribute('href');
  expect(new URL(signInHref, 'http://localhost').searchParams.get('next')).toBe('/labs?week=1');
  await expect(page.getByText(details.weeks[0].writing.prompt)).toBeVisible();
  await expect(page.getByText(details.weeks[0].speaking.prompt)).toBeVisible();
  const labsHtml = await page.content();
  expect(labsHtml).not.toContain(details.weeks[0].speaking.model);
  expect(labsHtml).not.toContain(details.weeks[0].writing.modelAnswer);
});

test('free practice keeps the B1 prompt and still uses the current week for pronunciation', async ({ page }) => {
  await page.goto('/labs');
  const writing = page.locator('#writing');
  await expect(writing.getByText('Write an email, a review or a short essay.', { exact: true })).toBeVisible();
  await expect(writing.getByText('Practise speaking for 1–2 minutes.', { exact: false })).toHaveCount(0);
  const speaking = page.locator('#speaking');
  await expect(speaking.getByText('Practise speaking for 1–2 minutes. Use linking words like however and so to connect your ideas.')).toBeVisible();
  await expect(speaking.getByText(/This task counts for Week/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Week 1 · Sentence 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Listen to the sentence', exact: true })).toBeVisible();

  // Current-week pronunciation notes use the B1 "short sound" wording without
  // changing the teacher's authored bank.
  await page.goto('/labs?week=2');
  await expect(page.getByRole('button', { name: 'Week 2 · Sentence 1' })).toBeVisible();
  await expect(page.getByText('to has a short sound ("tuh"); stress on look, for and see')).toBeVisible();
});

test('signing in from a weekly writing task keeps the week in the submitted request', async ({ page }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  test.skip(!url || !key, 'The sign-in flow needs a confirmed test user');
  test.setTimeout(120_000);
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const user = await createTestUser(admin, 'week-return');
  try {
    await page.goto('/week/1');
    await page.getByRole('link', { name: 'Start writing task' }).click();
    await page.getByRole('link', { name: 'Sign in for AI feedback →' }).click();
    await page.getByLabel(/Email/i).fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: /Sign in/i }).click();
    await page.waitForURL(/\/labs\?week=1(?:[&#]|$)/, { timeout: 60_000 });

    const writing = page.locator('#writing');
    await expect(writing.getByRole('link', { name: '← Back to Week 1' })).toBeVisible();
    await expect(writing.getByText('This task counts for Week 1.')).toBeVisible();

    // Intercept only the AI response: this checks the actual browser request
    // without spending AI quota. The server-side recording path is pinned by
    // learner-week-ui.test.mjs and is unchanged by the wording work.
    let sent = null;
    await page.route('**/api/writing/correct', async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { corrected: 'This is my corrected work.', score: 80 } });
    });
    await writing.locator('textarea').fill('I am writing about a change in my life. I moved to a new city and made some friends.');
    await writing.getByRole('button', { name: 'Evaluate writing' }).click();
    await expect(writing.getByText('This is my corrected work.')).toBeVisible();
    expect(sent?.weekNumber).toBe(1);
    expect(sent?.prompt.startsWith(details.weeks[0].writing.prompt)).toBe(true);
  } finally {
    await deleteTestUser(admin, user.id);
  }
});

test('checked reading answers are saved and Finish records the week', async ({ page }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  test.skip(!url || !key, 'The saved-answer flow needs a confirmed test user');
  test.setTimeout(240_000);
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const user = await createTestUser(admin, 'reading-finish');
  try {
    await page.goto('/login');
    await page.getByLabel(/Email/i).fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: /Sign in/i }).click();
    await page.waitForURL(/\/dashboard|\/labs/, { timeout: 60_000 });
    await page.goto('/week/1');
    const section = page.locator('#reading-practice');
    const items = section.locator('ol > li');
    const count = await items.count();
    expect(count).toBe(details.reading.weeks[0].questions.length);
    for (let index = 0; index < count; index++) {
      const item = items.nth(index);
      const radios = item.getByRole('radio');
      if (await radios.count()) await radios.first().check();
      else await item.locator('input:not([type="radio"])').fill('My answer');
      await item.getByRole('button', { name: 'Check', exact: true }).click();
      await expect(item.getByRole('status')).toContainText(/Correct|Not quite/);
    }
    const finish = section.getByRole('button', { name: 'Finish and save' });
    await expect(finish).toBeVisible();

    // Editing a checked answer makes it unchecked again, until the learner
    // checks the new choice. It must not count the old mark on screen.
    const first = items.first();
    await first.getByRole('radio').nth(1).check();
    await expect(finish).toHaveCount(0);
    await first.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(first.getByRole('status')).toContainText(/Correct|Not quite/);
    await expect(finish).toBeVisible();
    await finish.click();
    await expect(section.getByRole('status').filter({ hasText: 'Your answers are saved.' })).toBeVisible();

    const saved = await admin.from('week_input_answers').select('item_id').eq('user_id', user.id).eq('week_number', 1).eq('skill', 'reading');
    if (saved.error) throw saved.error;
    expect(saved.data).toHaveLength(count);
    const completed = await admin.from('week_input_submissions').select('week_number,skill').eq('user_id', user.id).eq('week_number', 1).eq('skill', 'reading').maybeSingle();
    if (completed.error) throw completed.error;
    expect(completed.data).toEqual({ week_number: 1, skill: 'reading' });
  } finally {
    await deleteTestUser(admin, user.id);
  }
});

for (const [placement, score, target, label] of [
  ['foundation', 5, '/labs', 'Open Practice'],
  ['stage1', 15, '/week/1', 'Start Week 1'],
  ['stage2', 22, '/week/17', 'Start Week 17'],
]) {
  test(`placement ${placement} button routes to ${target}`, async ({ page }) => {
    await page.route('**/api/placement/score', (route) => route.fulfill({ json: { score, total: 24, placement } }));
    await page.goto('/onboarding/placement');
    for (let i = 0; i < 24; i++) {
      await expect(page.getByRole('heading', { name: `Question ${i + 1} of 24` })).toBeVisible();
      await page.getByRole('button', { name: bank.questions[i].options[0], exact: true }).click();
      await page.getByRole('button', { name: i === 23 ? /Continue to Writing Sample/ : 'Next Question' }).click();
    }
    await page.getByRole('button', { name: 'Skip sample' }).click();
    await expect(page.getByText(`Suggested Band: ${placement === 'foundation' ? 'Foundation' : placement === 'stage1' ? 'Stage 1' : 'Stage 2'}`)).toBeVisible();
    await page.getByRole('button', { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${target.replace('/', '\\/')}(?:[?#]|$)`));
  });
}

test('learner navigation remembers the last opened week and hides staff links', async ({ page }) => {
  await page.goto('/week/4');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link', { name: 'This week' })).toHaveAttribute('href', '/week/4');
  for (const label of ['Practice', 'Review', 'My work', 'Dashboard']) {
    await expect(nav.getByRole('link', { name: label })).toBeVisible();
  }
  for (const label of ['Curriculum', 'Assessments', 'Teacher', 'Pricing']) {
    await expect(nav.getByRole('link', { name: label })).toHaveCount(0);
  }
  await page.getByRole('link', { name: 'Start speaking task' }).click();
  await expect(page.getByText(/Speak for 60.90 seconds/)).toBeVisible();
  await expect(page.locator('#speaking').getByRole('link', { name: '← Back to Week 4' })).toBeVisible();
  await page.reload();
  await expect(nav.getByRole('link', { name: 'This week' })).toHaveAttribute('href', '/week/4');
});

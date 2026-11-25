import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';
import { canUseReadingGateFixture, createReadingLearner, removeReadingLearner } from './helpers/reading-gate.mjs';

/**
 * Vocabulary step 3 on a phone: the gaps live inside the text.
 *
 * These interactions create a confirmed test learner and are skipped without
 * the service key. They pin the inline gap buttons, the word-box layout, used
 * words greyed out, and keyboard navigation (Enter opens, Escape closes and
 * returns focus). The signed-in check case also pins marking, feedback, and
 * reload restoration. Vocabulary practice remains available independently of
 * the reading-card meaning gate.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const bank = JSON.parse(
  readFileSync(new URL('../../supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json', import.meta.url)),
);
const week1 = bank.weeks.find((entry) => entry.week === 1);
let gateSession = null;
let gateCounter = 0;

test.afterEach(async () => {
  if (gateSession) await removeReadingLearner(gateSession.admin, gateSession.user);
  gateSession = null;
});

async function locateGapStep(page) {
  await page.goto('/week/1');
  const vocabulary = page.getByRole('region', { name: 'Vocabulary practice' });
  await expect(vocabulary.getByText('Step 1 of 7: Words')).toBeVisible();
  await vocabulary.getByRole('button', { name: 'Next', exact: true }).click();
  await vocabulary.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(vocabulary.getByText('Step 3 of 7: Complete the text')).toBeVisible();
  return vocabulary;
}

async function openGapStep(page) {
  test.skip(!canUseReadingGateFixture, 'Vocabulary interaction needs a service-key reader');
  gateSession = await createReadingLearner(page, `vocab-gap-setup-${++gateCounter}`);
  return locateGapStep(page);
}

async function pickWord(vocabulary, gap, word) {
  await vocabulary.getByTestId(`gap-button-${gap}`).click();
  const box = vocabulary.getByTestId('gap-word-box');
  await expect(box).toBeVisible();
  await box.locator(`button[data-word="${word}"]`).click();
  await expect(box).toHaveCount(0);
  await expect(vocabulary.getByTestId(`gap-button-${gap}`)).toHaveText(word);
}

test('phone: gaps sit inside the text, the word box is a fixed panel, used words grey out', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const vocabulary = await openGapStep(page);

  // The gaps are buttons inside the same paragraph as the story, not a list of
  // separate "Gap N" questions under it.
  const body = vocabulary.getByTestId('gap-text-body');
  await expect(body).toContainText('Two years ago');
  for (const item of week1.text.items) {
    await expect(body.getByTestId(`gap-button-${item.gap}`)).toBeVisible();
  }
  await expect(vocabulary.getByLabel('Gap 1', { exact: true })).toHaveCount(0);
  await expect(vocabulary.getByText('Word box:', { exact: false })).toHaveCount(0);

  // Open gap 1: on a phone the box is a small fixed panel at the bottom.
  const firstGap = vocabulary.getByTestId('gap-button-1');
  await expect(firstGap).toHaveAttribute('aria-expanded', 'false');
  await firstGap.click();
  const box = vocabulary.getByTestId('gap-word-box');
  await expect(box).toBeVisible();
  await expect(firstGap).toHaveAttribute('aria-expanded', 'true');
  await expect(firstGap).toHaveAttribute('aria-controls', 'gap-word-box');
  await expect(box).toHaveAttribute('role', 'dialog');
  await expect(box).toHaveAttribute('aria-label', 'Word box for gap 1');
  // The interactive box remains valid inline content within the story paragraph.
  await expect(body.locator('div, p')).toHaveCount(0);
  const position = await box.evaluate((element) => getComputedStyle(element).position);
  expect(position).toBe('fixed');
  const panel = await box.boundingBox();
  expect(panel, 'the panel has a box').not.toBeNull();
  expect(panel.y + panel.height, 'the panel sits at the bottom of the phone screen').toBeGreaterThan(667 - 40);
  expect(panel.height, 'the panel stays small').toBeLessThan(667 * 0.5);

  // Choose the inflected collocation for gap 1.
  await box.locator('button[data-word="made a big decision"]').click();
  await expect(box).toHaveCount(0);
  await expect(vocabulary.getByTestId('gap-button-1')).toHaveText('made a big decision');

  // In gap 2's box the same word is greyed out and cannot be picked.
  await vocabulary.getByTestId('gap-button-2').click();
  const used = box.locator('button[data-word="made a big decision"]');
  await expect(used).toBeDisabled();
  await expect(used).toContainText('used in gap 1');
  const grey = await used.evaluate((element) => getComputedStyle(element).color);
  const free = await box.locator('button[data-word="challenge"]').evaluate((element) => getComputedStyle(element).color);
  expect(grey, 'a used word is greyed out').not.toBe(free);

  // Keyboard: Escape closes and returns focus to the gap; Enter opens again;
  // the box opens with focus on a word, so Enter picks it.
  await page.keyboard.press('Escape');
  await expect(box).toHaveCount(0);
  await expect(vocabulary.getByTestId('gap-button-2')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(box).toBeVisible();
  await expect(box.locator('button[data-word="challenge"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(vocabulary.getByTestId('gap-button-2')).toHaveText('challenge');
  await expect(vocabulary.getByTestId('gap-button-2')).toBeFocused();

  // Remove word frees it again.
  await vocabulary.getByTestId('gap-button-2').click();
  await vocabulary.getByTestId('gap-remove-word').click();
  await expect(vocabulary.getByTestId('gap-button-2')).toHaveText('(2) choose word');
  await vocabulary.getByTestId('gap-button-1').click();
  await expect(box.locator('button[data-word="challenge"]')).toBeEnabled();
  await page.keyboard.press('Escape');

  // Moving between steps must not discard an unfinished choice.
  await vocabulary.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(vocabulary.getByText('Step 4 of 7: Choose the verb')).toBeVisible();
  await vocabulary.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(vocabulary.getByText('Step 3 of 7: Complete the text')).toBeVisible();
  await expect(vocabulary.getByTestId('gap-button-1')).toHaveText('made a big decision');
  await expect(vocabulary.getByTestId('gap-button-2')).toHaveText('(2) choose word');

  // An incomplete set of gaps is still not markable.
  await expect(vocabulary.getByTestId('gap-check')).toBeDisabled();
  await expect(vocabulary.getByText(/Sign in to check and save/)).toHaveCount(0);
});

test('desktop: the word box opens beside the gap, not as a fixed panel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const vocabulary = await openGapStep(page);
  const gap = vocabulary.getByTestId('gap-button-1');
  await gap.click();
  const box = vocabulary.getByTestId('gap-word-box');
  await expect(box).toBeVisible();
  const position = await box.evaluate((element) => getComputedStyle(element).position);
  expect(position).toBe('absolute');
  const gapBox = await gap.boundingBox();
  const panel = await box.boundingBox();
  expect(panel.y, 'the box opens below its gap').toBeGreaterThanOrEqual(gapBox.y);
  expect(Math.abs(panel.x - gapBox.x), 'the box is anchored at the gap').toBeLessThan(40);
});

test.describe('with a signed-in learner', () => {
  test.skip(!url || !key, 'Live test needs the service key');

  test('one Check marks every gap with a reason beside it, on a phone', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 375, height: 667 });
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const user = await createTestUser(admin, 'vocab-gap-text');
    try {
      await page.goto('/login');
      await page.getByLabel(/Email/i).fill(user.email);
      await page.getByLabel('Password', { exact: true }).fill(user.password);
      await page.getByRole('button', { name: /Sign in/i }).click();
      await page.waitForURL(/\/dashboard|\/labs/, { timeout: 60_000 });
      const vocabulary = await locateGapStep(page);

      // Check waits until every gap has a word.
      const check = vocabulary.getByTestId('gap-check');
      await expect(check).toBeDisabled();
      for (const item of week1.text.items) {
        await pickWord(vocabulary, item.gap, item.key);
      }
      await expect(check).toBeEnabled();
      await expect(vocabulary.getByText('Choose a word for every gap to check.')).toHaveCount(0);

      // Delay the real requests briefly so we can check the pending state. A
      // word cannot change while the server is marking its previous value.
      await page.route('**/api/week/vocabulary/mark', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 750));
        await route.continue();
      });
      // One Check marks all five gaps through the server, each with its reason.
      await check.click();
      await expect(vocabulary.getByTestId('gap-button-1')).toBeDisabled();
      await expect(vocabulary.getByTestId('gap-summary')).toHaveText('You got 5 of 5 right.', { timeout: 30_000 });
      for (const item of week1.text.items) {
        const result = vocabulary.getByTestId(`gap-result-${item.gap}`);
        await expect(result).toContainText('Correct!');
        await expect(result).toContainText(item.reason);
      }
      await expect(vocabulary.getByText('Saved ✓')).toBeVisible();

      // The checked choices and reasons also remain visible after changing steps.
      await vocabulary.getByRole('button', { name: 'Next', exact: true }).click();
      await vocabulary.getByRole('button', { name: 'Previous', exact: true }).click();
      await expect(vocabulary.getByTestId('gap-button-1')).toHaveText('made a big decision');
      await expect(vocabulary.getByTestId('gap-result-1')).toContainText(week1.text.items[0].reason);
      await expect(vocabulary.getByTestId('gap-summary')).toHaveText('You got 5 of 5 right.');

      // The attempts are rows on the server, one per gap, all correct.
      const attempts = await admin
        .from('week_vocabulary_attempts')
        .select('item_id, correct')
        .eq('user_id', user.id)
        .eq('week_number', 1)
        .in('item_id', week1.text.items.map((item) => item.id));
      if (attempts.error) throw attempts.error;
      expect(attempts.data?.length).toBe(5);
      expect(attempts.data?.every((row) => row.correct)).toBe(true);

      // The inflected answer feeds the headword's Review card via the alias list.
      const cards = await admin
        .from('vocab_cards')
        .select('id, vocab_items!inner(term)')
        .eq('user_id', user.id)
        .eq('vocab_items.term', 'make a big decision');
      if (cards.error) throw cards.error;
      expect(cards.data?.length, 'made a big decision updates the make a big decision card').toBe(1);

      // A wrong retry: swap gap 1 to an unused word and check again.
      await pickWord(vocabulary, 1, 'memorable');
      await expect(vocabulary.getByTestId('gap-result-1')).toHaveCount(0);
      await check.click();
      await expect(vocabulary.getByTestId('gap-summary')).toHaveText(
        'You got 4 of 5 right. Change a word and check again.',
        { timeout: 30_000 },
      );
      const wrong = vocabulary.getByTestId('gap-result-1');
      await expect(wrong).toContainText('Not quite.');
      await expect(wrong).toContainText(week1.text.items[0].reason);

      // Reload: the words and the marks come back from the server. Only the
      // gap text is answered, so the page resumes at the first unfinished
      // step (Match); one Next returns to the gap text.
      await page.reload();
      const reloaded = page.getByRole('region', { name: 'Vocabulary practice' });
      await expect(reloaded.getByText('Step 2 of 7: Match')).toBeVisible();
      await reloaded.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(reloaded.getByText('Step 3 of 7: Complete the text')).toBeVisible();
      await expect(reloaded.getByTestId('gap-button-1')).toHaveText('memorable');
      await expect(reloaded.getByTestId('gap-button-2')).toHaveText('challenge');
      await expect(reloaded.getByTestId('gap-result-1')).toContainText('Not quite.');
      await expect(reloaded.getByTestId('gap-result-2')).toContainText('Correct!');
    } finally {
      await deleteTestUser(admin, user.id);
    }
  });
});

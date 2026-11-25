import { test, expect } from '@playwright/test';
import { canUseReadingGateFixture, createReadingLearner, removeReadingLearner } from './helpers/reading-gate.mjs';

const step = (region, direction) => region.getByRole('button', { name: `${direction} step`, exact: true });

test('phone: counted grammar and gap checks finish after leaving their steps', async ({ page }) => {
  test.skip(!canUseReadingGateFixture, 'Needs a signed-in test learner');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { admin, user } = await createReadingLearner(page, 'item-pending');
  let releaseGrammar;
  let releaseGaps;
  const heldGrammar = new Promise((resolve) => { releaseGrammar = resolve; });
  const heldGaps = new Promise((resolve) => { releaseGaps = resolve; });
  try {
    await page.route('**/api/week/grammar/mark', async (route) => {
      await heldGrammar;
      await route.fulfill({ status: 200, json: { correct: true, reason: 'Practice feedback.' } });
    });
    await page.route('**/api/week/vocabulary/mark', async (route) => {
      if (route.request().postDataJSON().id.startsWith('V1-T')) await heldGaps;
      await route.fulfill({ status: 200, json: { correct: true, feedback: 'That is right.' } });
    });
    await page.goto('/week/1');
    const grammar = page.getByRole('region', { name: 'Grammar practice', exact: true });
    await step(grammar, 'Next').click();
    await grammar.getByRole('radio', { name: 'moved', exact: true }).check();
    await grammar.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(grammar.getByRole('button', { name: 'Checking…' })).toBeDisabled();
    for (let n = 0; n < 3; n += 1) await step(grammar, 'Next').click();
    const finishGrammar = grammar.getByRole('button', { name: 'Finish grammar' });
    await expect(finishGrammar).toBeDisabled();
    await expect(grammar.getByRole('status').filter({ hasText: 'Please wait to finish' })).toBeVisible();
    releaseGrammar();
    await expect(finishGrammar).toBeEnabled();
    for (let n = 0; n < 3; n += 1) await step(grammar, 'Previous').click();
    await expect(grammar.getByRole('radio', { name: 'moved', exact: true })).toBeChecked();
    await expect(grammar.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();

    const vocabulary = page.getByRole('region', { name: 'Vocabulary practice', exact: true });
    for (let n = 0; n < 3; n += 1) await step(vocabulary, 'Next').click();
    await vocabulary.getByRole('radio', { name: 'took', exact: true }).check();
    await vocabulary.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(vocabulary.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
    await step(vocabulary, 'Previous').click();
    for (let n = 1; n <= 5; n += 1) {
      await vocabulary.getByTestId(`gap-button-${n}`).click();
      await vocabulary.getByTestId('gap-word-box').locator('button[data-word]:not(:disabled)').first().click();
    }
    await vocabulary.getByTestId('gap-check').click();
    await expect(vocabulary.getByTestId('gap-check')).toHaveText('Checking…');
    for (let n = 0; n < 4; n += 1) await step(vocabulary, 'Next').click();
    const finishVocabulary = vocabulary.getByRole('button', { name: 'Finish vocabulary' });
    await expect(finishVocabulary).toBeDisabled();
    await expect(vocabulary.getByRole('status').filter({ hasText: 'Please wait to finish' })).toBeVisible();
    releaseGaps();
    await expect(finishVocabulary).toBeEnabled();
    for (let n = 0; n < 4; n += 1) await step(vocabulary, 'Previous').click();
    await expect(vocabulary.getByTestId('gap-summary')).toHaveText('You got 5 of 5 right.');
  } finally {
    releaseGrammar();
    releaseGaps();
    await removeReadingLearner(admin, user);
  }
});

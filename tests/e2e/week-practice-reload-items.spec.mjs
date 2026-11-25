import { test, expect } from '@playwright/test';
import { canUseReadingGateFixture, createReadingLearner, removeReadingLearner } from './helpers/reading-gate.mjs';

const step = (region, direction) => region.getByRole('button', { name: `${direction} step`, exact: true });
const tab = (region, position, total) => region.getByRole('tab', { name: `Go to item ${position} of ${total}` });

async function submit(page, button, path) {
  const [response] = await Promise.all([
    page.waitForResponse((result) => new URL(result.url()).pathname === path && result.request().method() === 'POST', { timeout: 30_000 }),
    button.click(),
  ]);
  expect(response.ok(), `${path} returned HTTP ${response.status()}`).toBe(true);
}

test('phone: real marks, optional rewrite and partial Finish survive reload on their own items', async ({ page }) => {
  test.skip(!canUseReadingGateFixture, 'Needs a service-key test learner and real storage');
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { admin, user } = await createReadingLearner(page, 'item-reload');
  try {
    await page.goto('/week/1');
    const grammar = page.getByRole('region', { name: 'Grammar practice', exact: true });
    const vocabulary = page.getByRole('region', { name: 'Vocabulary practice', exact: true });

    await step(grammar, 'Next').click();
    await grammar.getByRole('radio', { name: 'moved', exact: true }).check();
    await submit(page, grammar.getByRole('button', { name: 'Check', exact: true }), '/api/week/grammar/mark');
    await expect(grammar.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
    await step(grammar, 'Next').click();
    await tab(grammar, 4, 6).click();
    await grammar.getByRole('textbox').fill("I've been learning English since 2020.");
    await submit(page, grammar.getByRole('button', { name: 'Check', exact: true }), '/api/week/sentence');
    await expect(grammar.getByRole('status').filter({ hasText: 'Corrected sentence:' })).toBeVisible();
    await step(grammar, 'Next').click();
    await step(grammar, 'Next').click();
    await submit(page, grammar.getByRole('button', { name: 'Finish grammar' }), '/api/week/practice/finish');
    const grammarSummary = 'You answered 1 of 22. 1 was right. Great work! You can come back and finish the other questions.';
    await expect(grammar.getByRole('status').filter({ hasText: 'You answered' })).toHaveText(grammarSummary);

    for (let n = 0; n < 3; n += 1) await step(vocabulary, 'Next').click();
    await vocabulary.getByRole('radio', { name: 'took', exact: true }).check();
    await submit(page, vocabulary.getByRole('button', { name: 'Check', exact: true }), '/api/week/vocabulary/mark');
    await expect(vocabulary.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
    await step(vocabulary, 'Next').click();
    await vocabulary.getByRole('radio', { name: 'indecisive', exact: true }).check();
    await submit(page, vocabulary.getByRole('button', { name: 'Check', exact: true }), '/api/week/vocabulary/mark');
    await expect(vocabulary.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
    await step(vocabulary, 'Next').click();
    await vocabulary.getByRole('textbox').fill('take up');
    await submit(page, vocabulary.getByRole('button', { name: 'Check', exact: true }), '/api/week/vocabulary/mark');
    await expect(vocabulary.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
    await step(vocabulary, 'Next').click();
    await submit(page, vocabulary.getByRole('button', { name: 'Finish vocabulary' }), '/api/week/practice/finish');
    const vocabularySummary = 'You answered 3 of 16. 3 were right. Great work! You can come back and finish the other questions.';
    await expect(vocabulary.getByRole('status').filter({ hasText: 'You answered' })).toHaveText(vocabularySummary);

    // Unanswered questions and the optional rewrite are not counted as wrong
    // and do not create Review cards.
    const cards = await admin.from('error_review_cards').select('id').eq('user_id', user.id);
    if (cards.error) throw cards.error;
    expect(cards.data).toHaveLength(0);

    await page.reload();
    await expect(grammar.getByRole('status').filter({ hasText: 'You answered' })).toHaveText(grammarSummary);
    await expect(vocabulary.getByRole('status').filter({ hasText: 'You answered' })).toHaveText(vocabularySummary);
    // Grammar returns to the actual step last visited, then to the last
    // selected item in each paged step, with its saved answer and feedback.
    await expect(grammar.getByRole('heading', { name: 'Step 5 of 5: Remember' })).toBeVisible();
    await step(grammar, 'Previous').click();
    await step(grammar, 'Previous').click();
    await expect(grammar.getByRole('heading', { name: 'Item 4 of 6' })).toBeVisible();
    await expect(grammar.getByRole('textbox')).toHaveValue("I've been learning English since 2020.");
    await step(grammar, 'Previous').click();
    await expect(grammar.getByRole('heading', { name: 'Item 1 of 11' })).toBeVisible();
    await expect(grammar.getByRole('radio', { name: 'moved', exact: true })).toBeChecked();
    await expect(grammar.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();

    await expect(vocabulary.getByRole('heading', { name: 'Step 2 of 7: Match' })).toBeVisible();
    await step(vocabulary, 'Next').click();
    await step(vocabulary, 'Next').click();
    await expect(vocabulary.getByRole('heading', { name: 'Item 2 of 3' })).toBeVisible();
    await tab(vocabulary, 1, 3).click();
    await expect(vocabulary.getByRole('radio', { name: 'took', exact: true })).toBeChecked();
    await expect(vocabulary.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
    await step(vocabulary, 'Next').click();
    await expect(vocabulary.getByRole('heading', { name: 'Item 2 of 2' })).toBeVisible();
    await tab(vocabulary, 1, 2).click();
    await expect(vocabulary.getByRole('radio', { name: 'indecisive', exact: true })).toBeChecked();
    await expect(vocabulary.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
    await step(vocabulary, 'Next').click();
    await expect(vocabulary.getByRole('heading', { name: 'Item 2 of 3' })).toBeVisible();
    await tab(vocabulary, 1, 3).click();
    await expect(vocabulary.getByRole('textbox')).toHaveValue('take up');
    await expect(vocabulary.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
  } finally {
    await removeReadingLearner(admin, user);
  }
});

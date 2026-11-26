import { test, expect } from './helpers/isolated-test.mjs';
import { canUseReadingGateFixture, createReadingLearner, removeReadingLearner } from './helpers/reading-gate.mjs';

const phone = { width: 375, height: 667 };
const step = (region, direction) => region.getByRole('button', { name: `${direction} step`, exact: true });
const item = (region, direction) => region.getByRole('button', { name: `${direction} item`, exact: true });
const tab = (region, position, total) => region.getByRole('tab', { name: `Go to item ${position} of ${total}`, exact: true });

async function assertPosition(region, label, position, total) {
  await expect(region.getByRole('heading', { name: `Item ${position} of ${total}` })).toBeVisible();
  await expect(region.getByRole('progressbar', { name: `${label} item position` })).toHaveAttribute('aria-valuenow', String(position));
  await expect(region.getByRole('progressbar', { name: `${label} item position` })).toHaveAttribute('aria-valuemax', String(total));
  const selected = region.getByRole('tab', { selected: true });
  const panel = region.getByRole('tabpanel');
  await expect(selected).toHaveAccessibleName(`Go to item ${position} of ${total}`);
  await expect(panel).toHaveCount(1);
  await expect(panel).toHaveAttribute('id', await selected.getAttribute('aria-controls'));
  await expect(panel).toHaveAttribute('aria-labelledby', await selected.getAttribute('id'));
}

async function noHorizontalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('phone: grammar items, keyboard progress and unchanged See it/Use it', async ({ page }) => {
  await page.setViewportSize(phone);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/week/1');
  const grammar = page.getByRole('region', { name: 'Grammar practice', exact: true });

  // See it stays one screen: examples and all three meaning questions together.
  await expect(grammar.locator('p.whitespace-pre-line')).toBeVisible();
  await expect(grammar.getByRole('radio')).toHaveCount(6);
  await expect(grammar.getByRole('tablist')).toHaveCount(0);
  await step(grammar, 'Next').click();

  await assertPosition(grammar, 'Grammar Practise', 1, 11);
  await expect(item(grammar, 'Previous')).toBeDisabled();
  await expect(grammar.getByRole('radio')).toHaveCount(2);
  const option = grammar.getByRole('radio', { name: 'moved', exact: true });
  const optionBox = await option.locator('..').boundingBox();
  expect(optionBox.height).toBeGreaterThanOrEqual(44);
  await option.check(); // an unchecked draft, not a server mark

  // One tab stop in the progress bar, followed by the labelled panel and the
  // answer. End and arrow keys move directly around the progress bar.
  await tab(grammar, 1, 11).focus();
  await page.keyboard.press('Tab');
  await expect(grammar.getByRole('tabpanel')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(option).toBeFocused();
  await tab(grammar, 1, 11).focus();
  await page.keyboard.press('End');
  await expect(tab(grammar, 11, 11)).toBeFocused();
  await assertPosition(grammar, 'Grammar Practise', 11, 11);
  await expect(item(grammar, 'Next')).toBeDisabled();
  await expect(grammar.getByRole('textbox', { name: 'Your answer' })).toHaveAccessibleDescription('She was tired because she ___ (not sleep) the night before.');
  await grammar.getByRole('textbox', { name: 'Your answer' }).fill('a draft');
  await tab(grammar, 11, 11).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(tab(grammar, 10, 11)).toBeFocused();
  await item(grammar, 'Next').click();
  await expect(grammar.getByRole('heading', { name: 'Item 11 of 11' })).toBeFocused();
  await expect(grammar.getByRole('textbox', { name: 'Your answer' })).toHaveValue('a draft');

  await step(grammar, 'Next').click();
  await assertPosition(grammar, 'Grammar Fix it', 1, 6);
  await grammar.getByRole('textbox', { name: 'Your answer' }).fill('repair draft');
  await tab(grammar, 4, 6).click();
  await grammar.getByRole('textbox').fill('rewrite draft');
  await step(grammar, 'Next').click();
  // Use it is still the original two sentences together, not a pager.
  await expect(grammar.getByRole('heading', { name: 'Step 4 of 5: Use it' })).toBeVisible();
  await expect(grammar.getByRole('textbox')).toHaveCount(2);
  await expect(grammar.getByRole('tablist')).toHaveCount(0);
  await step(grammar, 'Previous').click();
  await assertPosition(grammar, 'Grammar Fix it', 4, 6);
  await expect(grammar.getByRole('textbox')).toHaveValue('rewrite draft');
  await tab(grammar, 1, 6).click();
  await expect(grammar.getByRole('textbox', { name: 'Your answer' })).toHaveValue('repair draft');
  await step(grammar, 'Previous').click();
  await assertPosition(grammar, 'Grammar Practise', 11, 11);
  await expect(grammar.getByRole('textbox', { name: 'Your answer' })).toHaveValue('a draft');
  await tab(grammar, 1, 11).click();
  await expect(option).toBeChecked();

  await step(grammar, 'Next').click();
  await step(grammar, 'Next').click();
  await step(grammar, 'Next').click();
  await assertPosition(grammar, 'Grammar Remember', 1, 5);
  await tab(grammar, 5, 5).click();
  await assertPosition(grammar, 'Grammar Remember', 5, 5);
  await expect(item(grammar, 'Next')).toBeDisabled();
  await expect(grammar.getByRole('button', { name: 'Finish grammar' })).toBeDisabled();
  await noHorizontalOverflow(page);
});

test('phone: vocabulary keeps Steps 1–3 and pages Steps 4–7', async ({ page }) => {
  await page.setViewportSize(phone);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/week/1');
  const vocabulary = page.getByRole('region', { name: 'Vocabulary practice', exact: true });

  await expect(vocabulary.getByText('Page 1 of 4')).toBeVisible();
  await expect(vocabulary.locator('article:visible')).toHaveCount(4);
  await vocabulary.getByRole('button', { name: 'Next words →' }).click();
  await expect(vocabulary.getByText('Page 2 of 4')).toBeVisible();
  await step(vocabulary, 'Next').click();
  await expect(vocabulary.getByRole('heading', { name: 'Step 2 of 7: Match' })).toBeVisible();
  await expect(vocabulary.getByRole('combobox')).toHaveCount(3);
  await expect(vocabulary.getByRole('tablist')).toHaveCount(0);
  await step(vocabulary, 'Next').click();
  await expect(vocabulary.getByRole('heading', { name: 'Step 3 of 7: Complete the text' })).toBeVisible();
  await expect(vocabulary.getByTestId('gap-text-body').getByRole('button')).toHaveCount(5);
  await expect(vocabulary.getByRole('tablist')).toHaveCount(0);

  await step(vocabulary, 'Next').click();
  await assertPosition(vocabulary, 'Vocabulary Choose the verb', 1, 3);
  await expect(vocabulary.getByRole('radio')).toHaveCount(4);
  const took = vocabulary.getByRole('radio', { name: 'took', exact: true });
  const target = await took.locator('..').boundingBox();
  expect(target.height).toBeGreaterThanOrEqual(44);
  await took.check();
  await item(vocabulary, 'Next').click();
  await assertPosition(vocabulary, 'Vocabulary Choose the verb', 2, 3);
  await item(vocabulary, 'Previous').click();
  await expect(took).toBeChecked();
  await tab(vocabulary, 3, 3).click();
  await expect(item(vocabulary, 'Next')).toBeDisabled();

  await step(vocabulary, 'Next').click();
  await assertPosition(vocabulary, 'Vocabulary Word forms', 1, 2);
  await expect(vocabulary.getByRole('radio')).toHaveCount(4);
  await vocabulary.getByRole('radio', { name: 'indecisive', exact: true }).check();
  await step(vocabulary, 'Next').click();
  await assertPosition(vocabulary, 'Vocabulary Type the word', 1, 3);
  await vocabulary.getByRole('textbox').fill('unfinished word');
  await item(vocabulary, 'Next').click();
  await vocabulary.getByRole('textbox').fill('second draft');
  await step(vocabulary, 'Next').click();
  await assertPosition(vocabulary, 'Vocabulary Your sentences', 1, 2);
  await vocabulary.getByRole('textbox').fill('My first sentence.');
  await item(vocabulary, 'Next').click();
  await vocabulary.getByRole('textbox').fill('My second sentence.');
  await item(vocabulary, 'Previous').click();
  await expect(vocabulary.getByRole('textbox')).toHaveValue('My first sentence.');
  await step(vocabulary, 'Previous').click();
  await assertPosition(vocabulary, 'Vocabulary Type the word', 2, 3);
  await expect(vocabulary.getByRole('textbox')).toHaveValue('second draft');
  await tab(vocabulary, 1, 3).click();
  await expect(vocabulary.getByRole('textbox')).toHaveValue('unfinished word');
  await step(vocabulary, 'Previous').click();
  await expect(vocabulary.getByRole('radio', { name: 'indecisive', exact: true })).toBeChecked();
  await step(vocabulary, 'Previous').click();
  await assertPosition(vocabulary, 'Vocabulary Choose the verb', 3, 3);
  await tab(vocabulary, 1, 3).click();
  await expect(took).toBeChecked();
  await noHorizontalOverflow(page);
});

for (const week of [2, 3, 4]) {
  test(`phone: the item navigation covers published Week ${week}`, async ({ page }) => {
    await page.setViewportSize(phone);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/week/${week}`);
    const grammar = page.getByRole('region', { name: 'Grammar practice', exact: true });
    await step(grammar, 'Next').click();
    await assertPosition(grammar, 'Grammar Practise', 1, 11);
    await step(grammar, 'Next').click();
    await assertPosition(grammar, 'Grammar Fix it', 1, 6);
    await step(grammar, 'Next').click();
    await expect(grammar.getByRole('textbox')).toHaveCount(2);
    await step(grammar, 'Next').click();
    await assertPosition(grammar, 'Grammar Remember', 1, 5);

    const vocabulary = page.getByRole('region', { name: 'Vocabulary practice', exact: true });
    for (let n = 0; n < 3; n += 1) await step(vocabulary, 'Next').click();
    await assertPosition(vocabulary, 'Vocabulary Choose the verb', 1, 3);
    await step(vocabulary, 'Next').click();
    await assertPosition(vocabulary, 'Vocabulary Word forms', 1, 2);
    await step(vocabulary, 'Next').click();
    await assertPosition(vocabulary, 'Vocabulary Type the word', 1, 3);
    await step(vocabulary, 'Next').click();
    await assertPosition(vocabulary, 'Vocabulary Your sentences', 1, 2);
    await noHorizontalOverflow(page);
  });
}

test('phone: an in-flight vocabulary check survives navigation and Finish waits', async ({ page }) => {
  test.skip(!canUseReadingGateFixture, 'Needs a signed-in test learner');
  test.setTimeout(180_000);
  await page.setViewportSize(phone);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { admin, user } = await createReadingLearner(page, 'item-vocabulary');
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let releaseFinish;
  const heldFinish = new Promise((resolve) => { releaseFinish = resolve; });
  let formAttempts = 0;
  const posted = [];
  try {
    // Deterministically delay one request; existing finish tests exercise the
    // real server route and database separately.
    await page.route('**/api/week/vocabulary/mark', async (route) => {
      const body = route.request().postDataJSON();
      posted.push(body);
      if (body.id === 'V1-C1') await held;
      if (body.id === 'V1-F1' && formAttempts++ === 0) {
        await route.fulfill({ status: 503, json: { error: 'We could not check your answer. Please try again.' } });
      } else {
        await route.fulfill({ status: 200, json: { correct: true, feedback: 'That is right.' } });
      }
    });
    await page.route('**/api/week/practice/finish', async (route) => {
      await heldFinish;
      await route.fulfill({ status: 200, json: { saved: true, summary: { answered: 3, correct: 3, wrong: 0, total: 16, reviewMistakes: 0, sentence: 'You answered 3 of 16. 3 were right. Great work! You know these words well. You can come back and finish the other questions.', next: 'reading' } } });
    });
    await page.goto('/week/1');
    const vocabulary = page.getByRole('region', { name: 'Vocabulary practice', exact: true });
    for (let n = 0; n < 3; n += 1) await step(vocabulary, 'Next').click();
    await vocabulary.getByRole('radio', { name: 'took', exact: true }).check();
    await vocabulary.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(vocabulary.getByRole('button', { name: 'Checking…' })).toBeDisabled();
    await expect(vocabulary.getByRole('radio', { name: 'took', exact: true })).toBeDisabled();
    await item(vocabulary, 'Next').click();
    await vocabulary.getByRole('radio', { name: 'making', exact: true }).check();
    await vocabulary.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(vocabulary.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();

    await step(vocabulary, 'Next').click();
    await vocabulary.getByRole('radio', { name: 'indecisive', exact: true }).check();
    await vocabulary.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(vocabulary.getByText('We could not check your answer. Please try again.', { exact: true })).toBeVisible();
    await step(vocabulary, 'Next').click();
    await step(vocabulary, 'Next').click();
    const finish = vocabulary.getByRole('button', { name: 'Finish vocabulary' });
    await expect(finish).toBeDisabled();
    await expect(vocabulary.getByRole('status').filter({ hasText: 'Please wait to finish' })).toBeVisible();
    release();
    await expect(finish).toBeEnabled();

    await step(vocabulary, 'Previous').click();
    await step(vocabulary, 'Previous').click();
    await expect(vocabulary.getByText('We could not check your answer. Please try again.', { exact: true })).toBeVisible();
    await expect(vocabulary.getByRole('radio', { name: 'indecisive', exact: true })).toBeChecked();
    await vocabulary.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(vocabulary.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
    await step(vocabulary, 'Previous').click();
    await tab(vocabulary, 1, 3).click();
    await expect(vocabulary.getByRole('radio', { name: 'took', exact: true })).toBeChecked();
    await expect(vocabulary.getByRole('status').filter({ hasText: 'Correct! That is right.' })).toBeVisible();
    expect(posted).toEqual(expect.arrayContaining([
      { week: 1, id: 'V1-C1', answer: 'took' },
      { week: 1, id: 'V1-C2', answer: 'making' },
      { week: 1, id: 'V1-F1', answer: 'indecisive' },
    ]));

    // The reverse race is blocked too: no counted check can start while a
    // Finish snapshot is being saved, even after navigating to another step.
    for (let n = 0; n < 3; n += 1) await step(vocabulary, 'Next').click();
    await finish.click();
    await expect(vocabulary.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await step(vocabulary, 'Previous').click();
    await step(vocabulary, 'Previous').click();
    await expect(vocabulary.getByRole('button', { name: 'Check', exact: true })).toBeDisabled();
    releaseFinish();
    await expect(vocabulary.getByRole('button', { name: 'Check', exact: true })).toBeEnabled();
    await expect(vocabulary.getByRole('status').filter({ hasText: 'You answered 3 of 16' })).toBeVisible();
  } finally {
    release();
    releaseFinish();
    await removeReadingLearner(admin, user);
  }
});

test('phone: adaptive grammar pages keep a pending rewrite when the branch changes', async ({ page }) => {
  test.skip(!canUseReadingGateFixture, 'Needs a signed-in test learner');
  test.setTimeout(180_000);
  await page.setViewportSize(phone);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { admin, user } = await createReadingLearner(page, 'item-grammar-adaptive');
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const wrong = new Set();
  try {
    await page.route('**/api/week/grammar/mark', async (route) => {
      const { id } = route.request().postDataJSON();
      await route.fulfill({ status: 200, json: { correct: !wrong.has(id), reason: 'Practice feedback.' } });
    });
    await page.route('**/api/week/sentence', async (route) => {
      await held;
      await route.fulfill({ status: 200, json: { onTarget: true, good: 'Nice work.', corrected: 'A saved sentence.', tip: 'Keep going.', addedToReview: false } });
    });
    await page.goto('/week/1');
    const grammar = page.getByRole('region', { name: 'Grammar practice', exact: true });
    await step(grammar, 'Next').click();
    await step(grammar, 'Next').click();
    await tab(grammar, 4, 6).click();
    await grammar.getByRole('textbox').fill('A sentence while the check is pending.');
    await grammar.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(grammar.getByRole('button', { name: 'Checking…' })).toBeDisabled();

    // Complete all eleven core items: at >=90%, rewrites are hidden.
    await step(grammar, 'Previous').click();
    for (let n = 1; n <= 11; n += 1) {
      await tab(grammar, n, 11).click();
      if (n <= 6) await grammar.getByRole('radio').first().check();
      else await grammar.getByRole('textbox', { name: 'Your answer' }).fill('test');
      await grammar.getByRole('button', { name: 'Check', exact: true }).click();
      await expect(grammar.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
    }
    await step(grammar, 'Next').click();
    await assertPosition(grammar, 'Grammar Fix it', 1, 3);
    await expect(grammar.getByRole('tab')).toHaveCount(3);
    await step(grammar, 'Next').click();
    await step(grammar, 'Next').click();
    await assertPosition(grammar, 'Grammar Remember', 1, 5);
    const finish = grammar.getByRole('button', { name: 'Finish grammar' });
    // An optional rewrite never blocks finishing the counted questions.
    await expect(finish).toBeEnabled();
    release();

    // Two changed marks reopen rewrites. The hidden request completed and its
    // draft and feedback must still be there on the same item.
    await step(grammar, 'Previous').click();
    await step(grammar, 'Previous').click();
    await step(grammar, 'Previous').click();
    for (let n = 1; n <= 2; n += 1) {
      wrong.add(`W1-C${n}`);
      await tab(grammar, n, 11).click();
      await grammar.getByRole('button', { name: 'Check', exact: true }).click();
      await expect(grammar.getByRole('status').filter({ hasText: 'Not quite.' })).toBeVisible();
    }
    await step(grammar, 'Next').click();
    await assertPosition(grammar, 'Grammar Fix it', 4, 6);
    await expect(grammar.getByRole('textbox')).toHaveValue('A sentence while the check is pending.');
    await expect(grammar.getByRole('status').filter({ hasText: 'Nice work.' })).toBeVisible();

    // Five wrong core answers are below 60%: three Extra items become separate
    // pages in Remember. A draft also survives leaving and returning to it.
    await step(grammar, 'Previous').click();
    for (let n = 3; n <= 5; n += 1) {
      wrong.add(`W1-C${n}`);
      await tab(grammar, n, 11).click();
      await grammar.getByRole('button', { name: 'Check', exact: true }).click();
      await expect(grammar.getByRole('status').filter({ hasText: 'Not quite.' })).toBeVisible();
    }
    await step(grammar, 'Next').click();
    await step(grammar, 'Next').click();
    await step(grammar, 'Next').click();
    await assertPosition(grammar, 'Grammar Remember', 1, 8);
    await tab(grammar, 6, 8).click();
    await expect(grammar.getByText('We ___ (watch) TV when the lights went out.')).toBeVisible();
    await grammar.getByRole('textbox', { name: 'Your answer' }).fill('extra draft');
    await item(grammar, 'Next').click();
    await item(grammar, 'Previous').click();
    await expect(grammar.getByRole('textbox', { name: 'Your answer' })).toHaveValue('extra draft');
    await noHorizontalOverflow(page);
  } finally {
    release();
    await removeReadingLearner(admin, user);
  }
});

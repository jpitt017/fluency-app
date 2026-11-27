import { openWeekTask } from './helpers/week-tasks.mjs';
import { expect, test } from './helpers/isolated-test.mjs';
import { canUseReadingGateFixture, createReadingLearner, removeReadingLearner } from './helpers/reading-gate.mjs';

/**
 * Exercise the real mark/finish routes and the saved snapshots. The test learner
 * is disposable, as in the other signed-in week tests; locally this can use a
 * fake Supabase. The exact boundary arithmetic is also covered by unit tests.
 */
async function mark(page, skill, id, answer, correct) {
  const response = await page.request.post(`/api/week/${skill}/mark`, {
    data: { week: 1, id, answer },
  });
  const result = await response.json().catch(() => null);
  const safeErrors = new Set([
    'Sign in to check your answer.', 'Please check your answer.',
    'This activity is not available.', 'This question is not available.',
    'Could not check your progress.', 'This week is not open yet.',
    'Could not save your answer.', 'Could not save your answer. Please try again.',
    'Something went wrong. Please try again, or message your teacher.',
  ]);
  const detail = safeErrors.has(result?.error) ? result.error : 'other or non-JSON error (redacted)';
  expect(response.ok(), `marking ${skill} ${id}: HTTP ${response.status()} (${detail})`).toBe(true);
  expect(result?.correct, `marking ${skill} ${id}`).toBe(correct);
}

async function finish(page, region, skill) {
  const button = region.getByRole('button', { name: `Finish ${skill}`, exact: true });
  for (let step = 0; step < 7 && !(await button.isVisible()); step += 1) {
    await activateWithKeyboard(page, region.getByRole('button', { name: 'Next step', exact: true }));
  }
  await expect(button).toBeEnabled();
  await button.focus();
  const [response] = await Promise.all([
    page.waitForResponse((res) => new URL(res.url()).pathname === '/api/week/practice/finish'
      && res.request().method() === 'POST', { timeout: 30_000 }),
    page.keyboard.press('Enter'),
  ]);
  expect(response.ok(), `finishing ${skill}: HTTP ${response.status()}`).toBe(true);
}

async function expectAdvice(region, skill, band, sentence) {
  const title = skill === 'grammar' ? 'Grammar practice finished' : 'Vocabulary practice finished';
  const revisitName = skill === 'grammar' ? 'Read the examples again' : 'Look at the words again';
  const reviewName = skill === 'grammar' ? 'Practise my mistakes' : 'Practise my words';
  const nextName = skill === 'grammar' ? 'Next: Vocabulary →' : 'Next: Reading →';
  const panel = region.getByRole('region', { name: title, exact: true });
  await expect(panel.getByRole('status')).toHaveText(sentence);
  await expect(panel.getByRole('button', { name: revisitName })).toHaveCount(band === 'low' ? 1 : 0);
  const review = panel.getByRole('link', { name: reviewName });
  await expect(review).toHaveCount(band === 'high' ? 0 : 1);
  if (band !== 'high') await expect(review).toHaveAttribute('href', '/review');
  await expect(panel.getByRole('button', { name: nextName })).toHaveCount(band === 'low' ? 0 : 1);
  return panel;
}

async function activateWithKeyboard(page, button) {
  await button.focus();
  await page.keyboard.press('Enter');
}

async function expectFocusedAndScrolled(page, target, id, behavior) {
  await expect(target).toBeFocused();
  await expect.poll(() => page.evaluate((targetId) => window.adviceScrolls.filter((call) => call.id === targetId).at(-1), id))
    .toEqual({ id, behavior, block: 'start' });
  // The target must be on screen, not hidden under the sticky header, on both
  // a small phone and a desktop. Wait for smooth scrolling to settle as well.
  await expect.poll(async () => {
    const [targetBox, headerBox] = await Promise.all([target.boundingBox(), page.locator('header').first().boundingBox()]);
    if (!targetBox || !headerBox) return false;
    const headerBottom = headerBox.y + headerBox.height;
    return targetBox.y >= headerBottom - 2 && targetBox.y < headerBottom + 80;
  }, { timeout: 10_000 }).toBe(true);
}

const grammarLow = "You answered 1 of 22. 0 were right. This grammar is new for you. That's OK! Read the examples again, then practise the questions you got wrong. You can come back and finish the other questions.";
const grammarMiddle = 'You answered 2 of 22. 1 was right. Good effort! Your mistakes are in Review, so you can practise them. You can come back and finish the other questions.';
const grammarHigh = 'You answered 5 of 22. 4 were right. Great work! You know this grammar well. You can come back and finish the other questions.';
const vocabularyLow = "You answered 1 of 16. 0 were right. These words are new for you. That's OK! Look at the words again, then practise them. You can come back and finish the other questions.";
const vocabularyMiddle = 'You answered 2 of 16. 1 was right. Good effort! Your mistakes are in Review, so you can practise them. You can come back and finish the other questions.';
const vocabularyHigh = 'You answered 5 of 16. 4 were right. Great work! You know these words well. You can come back and finish the other questions.';

for (const { label, width, height, motion, behavior } of [
  { label: 'phone', width: 375, height: 667, motion: 'reduce', behavior: 'instant' },
  { label: 'desktop', width: 1280, height: 800, motion: 'no-preference', behavior: 'smooth' },
]) {
  test(`${label}: score-specific Finish advice, actions, Review and reload`, async ({ page }) => {
    test.skip(!canUseReadingGateFixture, 'Needs a service-key test learner');
    test.setTimeout(240_000);
    page.setDefaultTimeout(20_000);
    page.setDefaultNavigationTimeout(45_000);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: motion });
    await page.addInitScript(() => {
      window.adviceScrolls = [];
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (options) {
        if (['grammar-examples', 'vocabulary-words', 'vocabulary-practice', 'reading-practice'].includes(this.id)) {
          window.adviceScrolls.push({ id: this.id, behavior: options?.behavior, block: options?.block });
        }
        return original.call(this, options);
      };
    });

    const { admin, user } = await createReadingLearner(page, `finish-advice-${label}`);
    try {
      // Grammar below 50%: a checked wrong answer is a valid partial finish.
      await mark(page, 'grammar', 'W1-M1', 'Yes', false);
      await page.goto('/week/1');
      const grammar = page.getByRole('region', { name: 'Grammar practice', exact: true });
      await finish(page, grammar, 'grammar');
      let panel = await expectAdvice(grammar, 'grammar', 'low', grammarLow);
      await activateWithKeyboard(page, panel.getByRole('button', { name: 'Read the examples again' }));
      await expect(grammar.getByRole('heading', { name: 'Step 1 of 5: See it' })).toBeVisible();
      const examples = grammar.locator('#grammar-examples');
      await expect(examples).toContainText('Three years ago, I moved to Bristol');
      await expectFocusedAndScrolled(page, examples, 'grammar-examples', behavior);
      // Repeating the action while already on step 1 must still focus the text.
      await activateWithKeyboard(page, panel.getByRole('button', { name: 'Read the examples again' }));
      await expectFocusedAndScrolled(page, examples, 'grammar-examples', behavior);
      await panel.getByRole('link', { name: 'Practise my mistakes' }).focus();
      await Promise.all([page.waitForURL('**/review'), page.keyboard.press('Enter')]);
      await expect(page.getByRole('heading', { name: 'Practise your mistakes' })).toBeVisible();
      await expect(page.getByText(/Had the speaker lived abroad before moving to Bristol/)).toBeVisible();
      await page.goto('/week/1');
      await expect(grammar.getByRole('heading', { name: 'Step 1 of 5: See it' })).toBeVisible();
      await expectAdvice(grammar, 'grammar', 'low', grammarLow);

      // 1 of 2 is exactly 50%: Review and Next, but no revisit button.
      await mark(page, 'grammar', 'W1-M1', 'No', true);
      await mark(page, 'grammar', 'W1-M3', 'No', false);
      await page.reload();
      await expect(grammar.getByText('Your latest answers may not match this score. Press Finish again to update it.')).toBeVisible();
      await expect(grammar.getByText('New mistakes may not be in Review yet.')).toBeVisible();
      await finish(page, grammar, 'grammar');
      panel = await expectAdvice(grammar, 'grammar', 'middle', grammarMiddle);
      await page.reload();
      panel = await expectAdvice(grammar, 'grammar', 'middle', grammarMiddle);
      await activateWithKeyboard(page, panel.getByRole('button', { name: 'Next: Vocabulary →' }));
      const vocabulary = page.getByRole('region', { name: 'Vocabulary practice', exact: true });
      await expect(vocabulary.getByRole('heading', { name: 'Step 1 of 7: Words' })).toBeFocused();

      // 4 of 5 is exactly 80%: only Next remains, including after reload.
      await mark(page, 'grammar', 'W1-M2', 'waiting', true);
      await mark(page, 'grammar', 'W1-C1', 'moved', true);
      await mark(page, 'grammar', 'W1-C2', 'have made', true);
      await page.reload();
      await openWeekTask(page, 'grammar-practice');
      // The server initially renders its first-unanswered fallback; hydration
      // then restores the last grammar position from this learner's browser.
      await expect(grammar.getByRole('heading', { name: 'Step 5 of 5: Remember' })).toBeVisible();
      await finish(page, grammar, 'grammar');
      await expectAdvice(grammar, 'grammar', 'high', grammarHigh);
      await page.reload();
      panel = await expectAdvice(grammar, 'grammar', 'high', grammarHigh);
      await activateWithKeyboard(page, panel.getByRole('button', { name: 'Next: Vocabulary →' }));
      await expect(vocabulary.getByRole('heading', { name: 'Step 1 of 7: Words' })).toBeFocused();

      // Vocabulary follows the same bands, with its own labels and words page.
      await mark(page, 'vocabulary', 'V1-C1', 'made', false);
      await page.reload();
      await finish(page, vocabulary, 'vocabulary');
      panel = await expectAdvice(vocabulary, 'vocabulary', 'low', vocabularyLow);
      await activateWithKeyboard(page, panel.getByRole('button', { name: 'Look at the words again' }));
      await expect(vocabulary.getByRole('heading', { name: 'Step 1 of 7: Words' })).toBeVisible();
      const words = vocabulary.getByRole('group', { name: 'Words for this week' });
      await expect(words.getByText('Page 1 of', { exact: false })).toBeVisible();
      await expectFocusedAndScrolled(page, words, 'vocabulary-words', behavior);
      // The existing word-card pages still work after returning to them.
      await activateWithKeyboard(page, words.getByRole('button', { name: 'Next words →' }));
      await expect(words.getByText('Page 2 of', { exact: false })).toBeVisible();
      await panel.getByRole('link', { name: 'Practise my words' }).focus();
      await Promise.all([page.waitForURL('**/review'), page.keyboard.press('Enter')]);
      await expect(page.getByRole('heading', { name: 'Practise your mistakes' })).toBeVisible();
      const cards = await admin.from('error_review_cards').select('category, corrected_sentence').eq('user_id', user.id);
      if (cards.error) throw cards.error;
      expect(cards.data).toEqual(expect.arrayContaining([
        { category: 'collocation', corrected_sentence: 'I took a risk and applied for a job abroad.' },
      ]));
      await page.goto('/week/1');
      await openWeekTask(page, 'vocabulary-practice');
      await expectAdvice(vocabulary, 'vocabulary', 'low', vocabularyLow);

      await mark(page, 'vocabulary', 'V1-C1', 'took', true);
      await mark(page, 'vocabulary', 'V1-F1', 'decisive', false);
      await page.reload();
      await expect(vocabulary.getByText('Your latest answers may not match this score. Press Finish again to update it.')).toBeVisible();
      await expect(vocabulary.getByText('New mistakes may not be in Review yet.')).toBeVisible();
      await finish(page, vocabulary, 'vocabulary');
      await expectAdvice(vocabulary, 'vocabulary', 'middle', vocabularyMiddle);
      await page.reload();
      panel = await expectAdvice(vocabulary, 'vocabulary', 'middle', vocabularyMiddle);
      await activateWithKeyboard(page, panel.getByRole('button', { name: 'Next: Reading →' }));
      await expect(page.locator('#reading-practice h2')).toBeFocused();

      await mark(page, 'vocabulary', 'V1-F2', 'adaptable', true);
      await mark(page, 'vocabulary', 'V1-C2', 'making', true);
      await mark(page, 'vocabulary', 'V1-C3', 'make', true);
      await page.reload();
      await openWeekTask(page, 'vocabulary-practice');
      await finish(page, vocabulary, 'vocabulary');
      await expectAdvice(vocabulary, 'vocabulary', 'high', vocabularyHigh);
      await page.reload();
      panel = await expectAdvice(vocabulary, 'vocabulary', 'high', vocabularyHigh);
      await activateWithKeyboard(page, panel.getByRole('button', { name: 'Next: Reading →' }));
      await expect(page.locator('#reading-practice h2')).toBeFocused();
    } finally {
      await removeReadingLearner(admin, user);
    }
  });
}

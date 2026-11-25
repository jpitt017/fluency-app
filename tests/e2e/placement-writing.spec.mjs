import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const bank = JSON.parse(readFileSync(new URL('../fixtures/placement-questions-v2.json', import.meta.url)));

const QUESTION_COUNT = 24;
const WRITING_PROMPT = 'Write 3–5 sentences (60–100 words). Say why you are learning English and what you find hard to talk about.';

/**
 * The placement quiz regression cover.
 *
 * The bug: after Q24, tapping "Continue to Writing Sample →" did nothing. The
 * cause, confirmed on production, was layout: at 375x667 the fixed "Problem? Tell
 * us" launcher sat on top of the full-width Continue button, so the tap opened
 * the report dialog and the quiz stayed on question 24.
 *
 * The quiz is answered on a phone viewport, with a hit-test on the real button,
 * and the walk continues past Q24 to the writing task and the result. The card is
 * also pinned at four options, because the base table carries a legacy v2-less
 * series as well and only the safe view keeps it out.
 */

/** Answer every question, assert the button is tappable, and land on the writing step. */
async function walkToWritingStep(page) {
  await page.goto('/onboarding/placement');

  for (let index = 0; index < QUESTION_COUNT; index += 1) {
    await expect(page.getByRole('heading', { name: `Question ${index + 1} of ${QUESTION_COUNT}` })).toBeVisible();

    // Exactly four options: the safe view must never let the legacy series in.
    const options = page.getByTestId('placement-option');
    await expect(options).toHaveCount(4);

    const next = page.getByTestId('placement-continue');
    await expect(next).toBeDisabled();

    await options.first().click();
    await expect(next).toBeEnabled();

    if (index === QUESTION_COUNT - 1) {
      // The real regression: the point a finger actually lands on must be the
      // Continue button, not the report launcher floating over it.
      await next.scrollIntoViewIfNeeded();
      const hit = await next.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return target?.closest('button') === element;
      });
      expect(hit, 'the centre of Continue to Writing Sample must be the button itself').toBe(true);
      await expect(next).toHaveText(/Continue to Writing Sample/);
    }

    await next.click();
  }

  await expect(page.getByRole('heading', { name: /Write a short text/ })).toBeVisible();
  // No missing-passage warning this deep in the quiz; the site chrome has its own
  // alert-role dialog, so scope the query to the quiz card.
  await expect(page.getByTestId('placement-options')).toHaveCount(0);
  await expect(page.getByText('Reading text is unavailable')).toHaveCount(0);
}

test('placement quiz reaches the writing task and the result on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.route('**/api/placement/score', (route) => route.fulfill({ json: { score: 22, total: 24, placement: 'stage2' } }));
  let sentPrompt;
  await page.route('**/api/writing/correct', (route) => {
    sentPrompt = route.request().postDataJSON().prompt;
    return route.fulfill({ json: { score: 80, feedback: 'Good work.' } });
  });

  await walkToWritingStep(page);
  await expect(page.getByText(WRITING_PROMPT, { exact: true })).toHaveCount(1);
  await expect(page.getByText(/Why are you learning English to B2/)).toHaveCount(0);

  // The word counter starts at zero and the hint explains the disabled button.
  const counter = page.getByTestId('writing-word-counter');
  const hint = page.getByTestId('writing-hint');
  const evaluate = page.getByRole('button', { name: /Evaluate Sample/ });

  await expect(counter).toHaveText('0 / 60-100 words');
  await expect(hint).toHaveText('Write at least 15 words, or skip');
  await expect(evaluate).toBeDisabled();

  // A few words is still too few.
  await page.getByRole('textbox').fill('I am learning English for work');
  await expect(counter).toHaveText('6 / 60-100 words');
  await expect(hint).toBeVisible();
  await expect(evaluate).toBeDisabled();

  // Enough words: the counter, the hint and the button all change together.
  await page.getByRole('textbox').fill(
    'I am learning English because I work with people in Dublin and I want to join meetings without feeling nervous. ' +
      'I find it hard to talk about technical topics on the phone, especially when people speak quickly.',
  );
  await expect(counter).toHaveText(/^37 \/ 60-100 words$/);
  await expect(hint).toHaveCount(0);
  await expect(evaluate).toBeEnabled();

  await evaluate.click();

  // The result, reached from the writing task rather than from Skip.
  await expect(page.getByRole('heading', { name: 'Placement Check Complete' })).toBeVisible();
  expect(sentPrompt).toBe(WRITING_PROMPT);
  await expect(page.getByText('Suggested Band: Stage 2')).toBeVisible();
  await expect(page.getByText('Quiz 22/24')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Week 17 →' })).toBeVisible();
});

test('the writing step can be skipped and still shows the result', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.route('**/api/placement/score', (route) => route.fulfill({ json: { score: 15, total: 24, placement: 'stage1' } }));

  await walkToWritingStep(page);
  await page.getByRole('button', { name: 'Skip sample' }).click();

  await expect(page.getByRole('heading', { name: 'Placement Check Complete' })).toBeVisible();
  await expect(page.getByText('Suggested Band: Stage 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Week 1 →' })).toBeVisible();
});

test('a slow score request shows a B1-friendly message and keeps the answers', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  // Never answer: the 20-second client timeout is what is under test.
  await page.route('**/api/placement/score', async () => {
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  });

  await walkToWritingStep(page);
  await page.getByRole('button', { name: 'Skip sample' }).click();

  await expect(page.getByText(/We could not check your answers/)).toBeVisible({ timeout: 30_000 });
  // The answers survive: Skip is usable again, so the learner is not trapped.
  await expect(page.getByRole('button', { name: 'Skip sample' })).toBeEnabled();
});

test('a slow writing evaluation falls back to the quiz result', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.route('**/api/placement/score', (route) => route.fulfill({ json: { score: 20, total: 24, placement: 'stage2' } }));
  await page.route('**/api/writing/correct', async () => {
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  });

  await walkToWritingStep(page);
  await page.getByRole('textbox').fill(
    'I am learning English because I want to speak with my colleagues in Dublin. ' +
      'I find it hard to talk about technical topics on the phone, so I practise every day.',
  );
  await page.getByRole('button', { name: /Evaluate Sample/ }).click();

  await expect(page.getByRole('heading', { name: 'Placement Check Complete' })).toBeVisible({ timeout: 35_000 });
  await expect(page.getByText(/We could not read your writing this time/)).toBeVisible();
  await expect(page.getByText('Suggested Band: Stage 2')).toBeVisible();
});

/**
 * The watchdog must not fire at a learner who simply has not clicked yet.
 *
 * The timer used to be armed by `selectedOption` changing, so picking an answer
 * and then thinking for four seconds produced "The page did not move to the next
 * question" — a false alarm, because nothing had been asked of the page.
 */
test('selecting an answer and waiting does not show the stuck warning', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/onboarding/placement');
  await expect(page.getByRole('heading', { name: 'Question 1 of 24' })).toBeVisible();

  await page.getByTestId('placement-option').first().click();
  await expect(page.getByTestId('placement-continue')).toBeEnabled();

  // Well past the 4 s watchdog: no click happened, so there is nothing to warn about.
  await page.waitForTimeout(5000);
  await expect(page.getByTestId('placement-stuck-warning')).toHaveCount(0);
  await expect(page.getByText(/did not move to the next question/)).toHaveCount(0);
  // And the quiz is still where it was, ready for the learner to decide.
  await expect(page.getByRole('heading', { name: 'Question 1 of 24' })).toBeVisible();
});

test('a normal Continue click advances and never shows the warning', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/onboarding/placement');
  await expect(page.getByRole('heading', { name: 'Question 1 of 24' })).toBeVisible();

  await page.getByTestId('placement-option').first().click();
  await page.getByTestId('placement-continue').click();
  await expect(page.getByRole('heading', { name: 'Question 2 of 24' })).toBeVisible();

  // The timer was cleared when the question changed, so nothing fires later.
  await page.waitForTimeout(5000);
  await expect(page.getByTestId('placement-stuck-warning')).toHaveCount(0);
});

test('the answer key never reaches the browser', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/onboarding/placement');
  const html = await page.content();
  expect(html).not.toContain('answer_index');
  expect(html).not.toContain('"reason"');
  // Four options per card and 24 questions: the legacy series stays out.
  expect(await page.getByTestId('placement-option').count()).toBe(4);
  expect(bank.questions.length).toBe(QUESTION_COUNT);
});

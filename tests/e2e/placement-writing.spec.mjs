import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const bank = JSON.parse(readFileSync(new URL('../fixtures/placement-questions-v2.json', import.meta.url)));

const QUESTION_COUNT = 24;

/**
 * The placement quiz regression cover.
 *
 * The bug: after Q24, tapping "Continue to Writing Sample →" did nothing. Two
 * causes are covered here.
 *
 * 1. At 375x667 the fixed "Problem? Tell us" launcher sat on top of the
 *    full-width Continue button, so the tap opened the report dialog instead.
 * 2. `placement_questions_safe` returns the v2 and the legacy rows, and both use
 *    sort_order 1–24, so the page arrived with 48 rows — two per question, eight
 *    options per card — instead of 24.
 *
 * The quiz is answered on a phone viewport, with a hit-test on the real button,
 * and the walk continues past Q24 to the writing task and the result.
 */

/** Answer every question, assert the button is tappable, and land on the writing step. */
async function walkToWritingStep(page) {
  await page.goto('/onboarding/placement');

  for (let index = 0; index < QUESTION_COUNT; index += 1) {
    await expect(page.getByRole('heading', { name: `Question ${index + 1} of ${QUESTION_COUNT}` })).toBeVisible();

    // Exactly four options: the duplicate-version bug showed eight.
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

  await walkToWritingStep(page);

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

test('the answer key never reaches the browser', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/onboarding/placement');
  const html = await page.content();
  expect(html).not.toContain('answer_index');
  expect(html).not.toContain('"reason"');
  // 24 questions, not 48: the duplicate-version rows must not be shipped either.
  expect(await page.getByTestId('placement-option').count()).toBe(4);
  expect(bank.questions.length).toBe(QUESTION_COUNT);
});

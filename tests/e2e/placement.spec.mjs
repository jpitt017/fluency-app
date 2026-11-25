import { expect, test } from '@playwright/test';

/**
 * Regression cover for the placement quiz "Continue to Writing Sample →" freeze.
 *
 * The quiz keeps every answer in component state, so the writing step can only
 * appear if all 24 answers were accepted in one page visit. These tests answer
 * every v2 question in the order the learner sees it, click the real Continue
 * button, and require the writing step — while recording console errors, page
 * errors and failed network requests so a future freeze names its own cause.
 */

const SMALL_SCREEN = { width: 375, height: 667 };

function watchPage(page) {
  const problems = { console: [], pageErrors: [], failedRequests: [], serverErrors: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') problems.console.push(message.text());
  });
  page.on('pageerror', (error) => problems.pageErrors.push(`${error.name}: ${error.message}`));
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'unknown';
    // Next.js cancels in-flight RSC prefetches when a test navigates away. This
    // is expected client navigation behavior, not an app/network failure.
    if (failure === 'net::ERR_ABORTED') return;
    problems.failedRequests.push(`${request.method()} ${request.url()} :: ${failure}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 500) problems.serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  return problems;
}

/** Select the first option, press Continue the way a learner would, and let the step change. */
async function answerCurrentQuestion(page, questionNumber, total) {
  const isLast = questionNumber === total;
  const heading = page.getByRole('heading', { name: `Question ${questionNumber} of ${total}` });
  await expect(heading).toBeVisible();

  const continueButton = page.getByRole('button', {
    name: isLast ? /Continue to Writing Sample/ : 'Next Question',
    exact: !isLast,
  });
  // Fail with the real reason instead of a generic timeout when this stays disabled.
  await expect(page.getByText('The reading passage for this question is unavailable', { exact: false })).toHaveCount(0);
  await expect(continueButton).toBeDisabled();

  await page.locator('main .space-y-2\\.5 > button').first().click();
  await expect(continueButton).toBeEnabled();
  await continueButton.click();

  if (isLast) {
    await expect(page.getByRole('heading', { name: /Write a short text/ })).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { name: `Question ${questionNumber + 1} of ${total}` })).toBeVisible();
  }
}

/** The full 24-question walk that used to freeze before the writing step. */
async function answerWholePlacementQuiz(page) {
  const banner = page.getByText(/\d+-questions and a writing task/);
  await expect(banner).toBeVisible();
  // The banner is uppercased by CSS, so read the text content rather than the rendered text.
  const total = Number((await banner.evaluate((element) => element.textContent ?? '')).match(/(\d+)-questions/)?.[1] ?? 0);
  expect(total).toBeGreaterThanOrEqual(24);

  const readingSections = new Set();
  for (let question = 1; question <= total; question++) {
    const reading = page.locator('section[aria-label^="Reading"]');
    if (await reading.count()) {
      await expect(reading.first()).toBeVisible();
      readingSections.add(await reading.first().getAttribute('aria-label'));
    }
    await answerCurrentQuestion(page, question, total);
  }
  // Both reading passages (A and B) were shown: the reading questions resolve their text.
  expect([...readingSections]).toEqual(expect.arrayContaining(['Reading A', 'Reading B']));
  return total;
}

/** The Q24 action must be the thing a tap at the bottom-right of the button hits. */
async function expectNoOverlapWithContinueButton(page) {
  const button = page.getByRole('button', { name: /Continue to Writing Sample/ });
  // Wait for the short transition on the option buttons to finish so the button
  // is measured where a learner would actually see and tap it.
  await page.waitForTimeout(400);
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeInViewport();

  // Measure and hit-test in one pass: a box measured in an earlier call can go
  // stale while the card scrolls or animates.
  const result = await page.evaluate(() => {
    const continueButton = [...document.querySelectorAll('main button')]
      .find((element) => /Continue to Writing Sample/.test(element.textContent || ''));
    if (!continueButton) return { error: 'continue button not found' };
    const rect = continueButton.getBoundingClientRect();
    const describe = (element) => (element ? `${element.tagName}:${(element.textContent || '').trim().slice(0, 40)}` : 'none');
    // Points well inside the tappable area, including the bottom-right corner
    // where a floating report button would sit.
    const points = {
      center: [rect.left + rect.width / 2, rect.top + rect.height / 2],
      bottomCenter: [rect.left + rect.width / 2, rect.bottom - 6],
      bottomRight: [rect.right - 6, rect.bottom - 6],
      rightEdge: [rect.right - 10, rect.top + rect.height / 2],
    };
    const hits = Object.fromEntries(Object.entries(points).map(([name, [x, y]]) => [
      name,
      describe(document.elementFromPoint(x, y)?.closest('button, a')),
    ]));
    const reporter = [...document.querySelectorAll('button')]
      .find((element) => (element.textContent || '').trim() === 'Problem? Tell us');
    const reporterRect = reporter?.getBoundingClientRect() ?? null;
    return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, hits, reporterRect };
  });

  expect(result.error, 'the Continue button should be on the last question').toBeUndefined();
  for (const [point, hit] of Object.entries(result.hits)) {
    expect(hit, `tapping the ${point} of the Continue button must reach it, not the report button`).toContain('Continue to Writing Sample');
  }
  // The report launcher must never sit in the button's band.
  const { rect, reporterRect } = result;
  if (reporterRect) {
    const overlaps = reporterRect.left < rect.x + rect.width && reporterRect.right > rect.x
      && reporterRect.top < rect.y + rect.height && reporterRect.bottom > rect.y;
    expect(overlaps, 'the report button covers the placement Continue button').toBe(false);
  }
  // A real tap on the button must move the quiz on, not open the report dialog.
  await button.click();
  await expect(page.getByRole('heading', { name: /Write a short text/ })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('placement quiz reaches the writing step', () => {
  test.beforeEach(async ({ page }) => {
    // The quiz is deterministic; make sure no earlier visit leaves a week cookie or reload.
    await page.context().clearCookies();
  });

  test('signed out: all 24 v2 questions continue into the writing step', async ({ page }) => {
    const problems = watchPage(page);
    const response = await page.goto('/onboarding/placement');
    expect(response?.status()).toBe(200);

    await answerWholePlacementQuiz(page);

    // The writing task is usable: the live counter reads "23 / 60-100 words" and
    // the hint explains why Evaluate is disabled.
    const counter = page.getByTestId('writing-word-counter');
    await expect(counter).toHaveText('0 / 60-100 words');
    await expect(page.getByTestId('writing-hint')).toHaveText('Write at least 15 words, or skip');
    const evaluate = page.getByRole('button', { name: 'Evaluate Sample & Recommend Level' });
    await expect(evaluate).toBeDisabled();
    await page.getByRole('textbox').fill('One two three four five six seven.');
    await expect(counter).toHaveText('7 / 60-100 words');
    await expect(evaluate).toBeDisabled();
    // Exactly sixty words reaches the target the task asks for.
    await page.getByRole('textbox').fill(Array.from({ length: 60 }, (_, index) => `word${index + 1}`).join(' '));
    await expect(counter).toHaveText('60 / 60-100 words');
    await expect(page.getByTestId('writing-hint')).toHaveCount(0);
    await expect(evaluate).toBeEnabled();

    expect(problems.pageErrors).toEqual([]);
    expect(problems.console.filter((text) => !/favicon|manifest/i.test(text))).toEqual([]);
    expect(problems.failedRequests).toEqual([]);
    expect(problems.serverErrors).toEqual([]);
  });

  test('signed out on a small phone: the report button never covers Continue', async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(SMALL_SCREEN);
    await page.goto('/onboarding/placement');

    const banner = page.getByText(/\d+-questions and a writing task/);
    const total = Number((await banner.evaluate((element) => element.textContent ?? '')).match(/(\d+)-questions/)?.[1] ?? 24);
    for (let question = 1; question < total; question++) {
      await page.locator('main .space-y-2\\.5 > button').first().click();
      await page.getByRole('button', { name: 'Next Question', exact: true }).click();
      await expect(page.getByRole('heading', { name: `Question ${question + 1} of ${total}` })).toBeVisible();
    }

    // A mobile learner taps the right half of the full-width button, which is
    // exactly where a floating "Problem? Tell us" pill used to sit.
    await page.locator('main .space-y-2\\.5 > button').first().click();
    await expectNoOverlapWithContinueButton(page);

    // The rest of the walk on a phone also lands on a usable writing step.
    await expect(page.getByTestId('writing-word-counter')).toHaveText('0 / 60-100 words');
    expect(problems.pageErrors).toEqual([]);
    expect(problems.serverErrors).toEqual([]);
  });

  test('signed in: all 24 v2 questions continue into the writing step and score the result', async ({ page }) => {
    const email = process.env.E2E_USER_EMAIL;
    const password = process.env.E2E_USER_PASSWORD;
    test.skip(!email || !password, 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run the signed-in walk');

    const problems = watchPage(page);
    await page.goto('/login');
    await page.getByLabel(/Email address/i).fill(email);
    await page.getByLabel(/^Password/i).fill(password);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await page.waitForURL(/\/(dashboard|labs|teacher|onboarding)/, { timeout: 30_000 });

    const response = await page.goto('/onboarding/placement');
    expect(response?.status()).toBe(200);
    await answerWholePlacementQuiz(page);

    // Signed-in learners must still be able to finish (server scoring + save).
    await page.getByRole('button', { name: 'Skip sample' }).click();
    await expect(page.getByRole('heading', { name: 'Placement Check Complete' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Suggested Band: (Foundation|Stage 1|Stage 2)/)).toBeVisible();

    expect(problems.pageErrors).toEqual([]);
    expect(problems.console.filter((text) => !/favicon|manifest/i.test(text))).toEqual([]);
    expect(problems.failedRequests).toEqual([]);
    expect(problems.serverErrors).toEqual([]);
  });
});

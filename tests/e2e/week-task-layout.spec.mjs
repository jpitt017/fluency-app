import { test, expect } from './helpers/isolated-test.mjs';
import { readFileSync } from 'node:fs';
import { openWeekTask } from './helpers/week-tasks.mjs';
import { answerReadingAndFinish, canUseReadingGateFixture, createReadingLearner, removeReadingLearner } from './helpers/reading-gate.mjs';

const details = JSON.parse(
  readFileSync(new URL('../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json', import.meta.url), 'utf8'),
);

const TASKS = [
  ['Grammar', 'grammar-practice'],
  ['Vocabulary', 'vocabulary-practice'],
  ['Reading', 'reading-practice'],
  ['Listening', 'listening-practice'],
  ['Speaking', 'speaking-practice'],
  ['Writing', 'writing-practice'],
];

/**
 * The week overview and the one-task accordion on /week/[n]: the six cards
 * with minutes and done marks, tapping a card to jump to its task, one task
 * open at a time, and the "Next: … →" button at the end of each. Checked at a
 * phone width and a desktop width.
 */
for (const [width, height] of [[375, 667], [1280, 800]]) {
  test(`at ${width} px: the overview cards jump to tasks and one task is open at a time`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/week/1');

    // The overview lists all six tasks, each with a rough time label and a
    // link to the task's dashboard anchor.
    const overview = page.locator('#week-overview');
    await expect(overview).toBeVisible();
    const cards = overview.locator('a');
    await expect(cards).toHaveCount(6);
    for (const [label, anchor] of TASKS) {
      const card = overview.locator(`a[href="#${anchor}"]`);
      await expect(card).toBeVisible();
      await expect(card).toContainText(label);
      await expect(card).toContainText(/min/);
    }

    // The first task is open on arrival; the others are closed but their rows
    // and headings stay on the page.
    await expect(page.locator('#grammar-practice-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#grammar-practice-body')).toBeVisible();
    await expect(page.locator('#reading-practice-body')).toBeHidden();

    // Tapping a card jumps to that task, opens it, and closes the other: the
    // dashboard anchors and the focus move with it.
    await overview.locator('a[href="#reading-practice"]').click();
    await expect(page.locator('#reading-practice-body')).toBeVisible();
    await expect(page.locator('#grammar-practice-body')).toBeHidden();
    await expect(page.locator('#reading-practice h2')).toBeFocused();
    await expect(page).toHaveURL(/#reading-practice$/);

    // The row toggle opens a task without any scrolling.
    await page.locator('#listening-practice-toggle').click();
    await expect(page.locator('#listening-practice-body')).toBeVisible();
    await expect(page.locator('#reading-practice-body')).toBeHidden();
    await expect(page.locator('#listening-practice-toggle')).toHaveAttribute('aria-expanded', 'true');

    // Every task ends with "Next: … →", and pressing it opens the next task
    // and focuses its heading. The last task points back at the overview.
    await openWeekTask(page, 'speaking-practice');
    const next = page.locator('#speaking-practice-body').getByRole('button', { name: 'Next: Writing →' });
    await next.click();
    await expect(page.locator('#writing-practice-body')).toBeVisible();
    await expect(page.locator('#writing-practice h2')).toBeFocused();
    await expect(page.locator('#writing-practice-body').getByRole('button', { name: 'Next: Week overview →' })).toBeVisible();
    await page.locator('#writing-practice-body').getByRole('button', { name: 'Next: Week overview →' }).click();
    await expect(overview).toBeInViewport();

    // Opening a task records it: a reload comes back to the same task.
    await openWeekTask(page, 'speaking-practice');
    await page.reload();
    await expect(page.locator('#speaking-practice-body')).toBeVisible();
    await expect(page.locator('#writing-practice-body')).toBeHidden();
  });
}

test('the listening picture box is hidden until the week has a picture', async ({ page }) => {
  await page.goto('/week/1#listening-practice');
  await expect(page.locator('#listening-practice-body')).toBeVisible();
  await expect(page.getByTestId('listening-picture-placeholder')).toHaveCount(0);
  await expect(page.getByTestId('listening-picture')).toHaveCount(0);
});

for (const [width, height] of [[375, 667], [1280, 800]]) {
  test(`at ${width} px: learner text is at least 14px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/week/1#reading-practice');
    const samples = [
      '#week-overview a span',            // card label
      '#reading-practice h2 button',      // task heading
      '#reading-practice-body p',         // task copy
      '#reading-practice-body button',    // a control label
    ];
    for (const selector of samples) {
      const size = await page.locator(selector).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(size, selector).toBeGreaterThanOrEqual(14);
    }
  });
}

test('the done mark comes from completions and saved attempts', async ({ page }) => {
  test.skip(!canUseReadingGateFixture, 'Needs a service-key test learner');
  test.setTimeout(240_000);
  const { admin, user } = await createReadingLearner(page, 'week-task-done');
  try {
    await answerReadingAndFinish(page);
    await page.goto('/week/1');
    const readingCard = page.locator('#week-overview a[href="#reading-practice"]');
    await expect(readingCard).toContainText('✓');
    // Nothing else is finished for this learner yet.
    const grammarCard = page.locator('#week-overview a[href="#grammar-practice"]');
    await expect(grammarCard).not.toContainText('✓');
  } finally {
    await removeReadingLearner(admin, user);
  }
});

test('checked answers colour green for correct, amber for not quite, red only for errors', async ({ page }) => {
  test.skip(!canUseReadingGateFixture, 'Needs a service-key test learner');
  test.setTimeout(240_000);
  const { admin, user } = await createReadingLearner(page, 'week-task-colours');
  try {
    await page.goto('/week/1#reading-practice');
    const questions = details.reading.weeks[0].questions;
    const clickable = (question) => question?.options && question.options.length >= 2;
    test.skip(!clickable(questions[0]) || !clickable(questions[1]), 'The first two questions need options to click');
    const panel = page.locator('#reading-questions').getByRole('tabpanel');
    async function answer(option) {
      const button = panel.getByRole('button', { name: option, exact: true });
      if (await button.count()) await button.click();
      else await panel.getByRole('radio', { name: option, exact: true }).check();
      const check = panel.getByRole('button', { name: 'Check', exact: true });
      if (await check.count()) await check.click();
    }
    async function mark() {
      return panel.getByRole('status').filter({ hasText: /Correct|Not quite/ }).first();
    }
    // Question 1, a wrong option: "Not quite" is amber, never red.
    const first = questions[0];
    await answer(first.options.find((option) => option !== first.key) ?? first.options[0]);
    const wrongMark = await mark();
    await expect(wrongMark).toContainText('Not quite');
    const wrongClass = await wrongMark.getAttribute('class');
    expect(wrongClass).toContain('amber');
    expect(wrongClass).not.toMatch(/red|rose/);
    // Question 2, the right option: green.
    await page.locator('#reading-questions').getByRole('tab', { name: `Go to question 2 of ${questions.length}` }).click();
    const second = questions[1];
    await answer(second.key ?? second.options[0]);
    await expect(await mark()).toContainText('Correct');
    expect(await (await mark()).getAttribute('class')).toContain('emerald');
  } finally {
    await removeReadingLearner(admin, user);
  }
});

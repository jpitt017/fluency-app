import { expect, test } from './helpers/isolated-test.mjs';
import { readFileSync } from 'node:fs';
import {
  MINI_PLAYER_WRAPPER_CLASS,
  questionPositionLabel,
  readingTextPanelClass,
  wordPositionLabel,
} from '../../lib/curriculum/week-input-ui.mjs';
import { answerReadingAndFinish, canUseReadingGateFixture, createReadingLearner, removeReadingLearner } from './helpers/reading-gate.mjs';

const content = JSON.parse(readFileSync(new URL('../../supabase-b1-b2/content/curriculum/reading-support-weeks-01-04.json', import.meta.url), 'utf8'));
const items = content.weeks.find((week) => week.week === 1).glossCheck;

test.beforeEach(async ({ page }) => {
  // The pager scrolls the current question into view; make that instant so the
  // viewport is stable before the next assertion or click.
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Measure a real Tailwind class string against the app's compiled stylesheet. */
async function measure(page, className) {
  return page.evaluate((value) => {
    let probe = document.getElementById('layout-probe');
    if (!probe) {
      probe = document.createElement('div');
      probe.id = 'layout-probe';
      document.body.appendChild(probe);
    }
    probe.className = value;
    const style = getComputedStyle(probe);
    return { position: style.position, display: style.display, bottom: style.bottom };
  }, className);
}

test('at 375 px: one question at a time, short option buttons, text panel over the question', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/week/1');
  const reading = page.locator('#reading-practice');
  const questions = reading.locator('#reading-questions');
  await questions.scrollIntoViewIfNeeded();
  const show = page.getByTestId('show-reading-text');
  const panel = reading.getByTestId('reading-text-panel');

  // The fixed phone button opens the text in front of the question.
  await expect(show).toBeVisible();
  expect(await show.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
  await expect(panel).toBeHidden();
  await expect(questions.getByRole('heading', { name: questionPositionLabel(0, 10) })).toBeVisible();
  await expect(questions.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await expect(questions.getByRole('progressbar')).toHaveAttribute('aria-valuetext', questionPositionLabel(0, 10));

  await show.click();
  const dialog = page.getByRole('dialog', { name: 'Reading text' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('When I moved from Seville');
  expect(await panel.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(show).toBeFocused();
  await show.click();
  await page.getByRole('button', { name: 'Close the text' }).click();
  await expect(panel).toBeHidden();

  // Previous / Next, a jump from the bar, and arrow keys on the tab list.
  await questions.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(questions.getByRole('heading', { name: questionPositionLabel(1, 10) })).toBeVisible();
  const yes = questions.getByRole('button', { name: 'True', exact: true });
  const no = questions.getByRole('button', { name: 'False', exact: true });
  const yesBox = await yes.boundingBox();
  const noBox = await no.boundingBox();
  expect(yesBox.height).toBeGreaterThanOrEqual(44);
  expect(noBox.x).toBeGreaterThan(yesBox.x);
  expect(Math.abs(noBox.y - yesBox.y)).toBeLessThan(2);
  await yes.click();
  await expect(yes).toHaveAttribute('aria-pressed', 'true');
  await questions.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(questions.getByRole('heading', { name: questionPositionLabel(0, 10) })).toBeVisible();
  await questions.getByRole('tab', { name: 'Go to question 3 of 10' }).click();
  await expect(questions.getByRole('heading', { name: questionPositionLabel(2, 10) })).toBeVisible();
  await questions.getByRole('tab', { name: 'Go to question 3 of 10' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(questions.getByRole('heading', { name: questionPositionLabel(1, 10) })).toBeVisible();
  await expect(questions.getByRole('tab', { name: 'Go to question 2 of 10' })).toBeFocused();
});

test('at 1280 px: the text stays on the left with the questions on the right', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/week/1');
  const reading = page.locator('#reading-practice');
  await reading.scrollIntoViewIfNeeded();
  const panel = reading.getByTestId('reading-text-panel');
  const column = reading.getByTestId('reading-question-column');

  await expect(panel).toBeVisible();
  await expect(panel).toContainText('When I moved from Seville');
  await expect(page.getByTestId('show-reading-text')).toBeHidden();
  expect(await panel.evaluate((el) => getComputedStyle(el).position)).toBe('static');
  expect(await panel.locator('div').first().evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
  const textBox = await panel.boundingBox();
  const questionBox = await column.boundingBox();
  expect(textBox.x).toBeLessThan(questionBox.x);
  expect(Math.abs(textBox.y - questionBox.y)).toBeLessThan(2);
  expect(textBox.x + textBox.width).toBeLessThanOrEqual(questionBox.x + 1);
  await expect(column.getByRole('heading', { name: questionPositionLabel(0, 10) })).toBeVisible();
  await expect(column.getByRole('progressbar')).toHaveAttribute('aria-valuetext', questionPositionLabel(0, 10));
});

test('375 px and 1280 px: the replay player and reading panel classes really switch layout', async ({ page }) => {
  await page.goto('/week/1'); // loads the app's compiled Tailwind stylesheet
  await page.setViewportSize({ width: 375, height: 667 });
  const phoneMini = await measure(page, MINI_PLAYER_WRAPPER_CLASS);
  expect(phoneMini.position).toBe('fixed');
  expect(phoneMini.bottom).toBe('0px');
  expect((await measure(page, readingTextPanelClass(false))).display).toBe('none');
  expect((await measure(page, readingTextPanelClass(true))).position).toBe('fixed');

  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopMini = await measure(page, MINI_PLAYER_WRAPPER_CLASS);
  expect(desktopMini.position).toBe('static');
  expect((await measure(page, readingTextPanelClass(false))).display).toBe('block');
  expect((await measure(page, readingTextPanelClass(true))).position).toBe('static');
});

test('the real replay player keeps its controls when approved audio is present', async ({ page }) => {
  await page.goto('/week/1');
  const full = page.getByTestId('listening-trial-player');
  test.skip((await full.count()) === 0, 'The isolated E2E project has no approved trial audio');
  for (const [width, height, expected] of [[375, 667, 'fixed'], [1280, 800, 'static']]) {
    await page.setViewportSize({ width, height });
    // Scroll the questions to the top so the full player is above the viewport:
    // that is when the small player takes over on a phone.
    await page.locator('#listening-questions').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
    const mini = page.getByTestId('listening-mini-player');
    await expect(mini).toBeVisible();
    await expect(mini.getByRole('button', { name: 'Back 5 seconds' })).toBeVisible();
    await expect(mini.getByRole('button', { name: /Play|Pause/ })).toBeVisible();
    expect(await mini.locator('p').first().textContent()).toMatch(/\d:\d\d \/ \d:\d\d/);
    const wrapper = page.getByTestId('listening-mini-player-wrapper');
    expect(await wrapper.evaluate((el) => getComputedStyle(el).position)).toBe(expected);
    if (width === 1280) {
      const questionsBox = await page.locator('#listening-questions').boundingBox();
      const miniBox = await wrapper.boundingBox();
      expect(miniBox.x).toBeGreaterThan(questionsBox.x);
    }
  }
});

test('Check four words is one word at a time at 375 px and 1280 px', async ({ page }) => {
  test.skip(!canUseReadingGateFixture, 'Needs a service-key test learner');
  test.setTimeout(240_000);
  const { admin, user } = await createReadingLearner(page, 'word-pager');
  try {
    await answerReadingAndFinish(page);
    for (const [width, height] of [[375, 667], [1280, 800]]) {
      await page.setViewportSize({ width, height });
      await page.goto('/week/1');
      const reading = page.locator('#reading-practice');
      const summary = reading.getByText('Go further (2–3 min)', { exact: true });
      // The phone's fixed "Show the text" button sits at the bottom; centre the
      // summary so the click is not near it.
      await summary.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await summary.click();
      const check = reading.locator('section[aria-labelledby="reading-gloss-check-heading"]');
      await expect(check.getByRole('heading', { name: wordPositionLabel(0, 4) })).toBeVisible();
      for (let index = 0; index < items.length; index += 1) {
        const panel = check.getByRole('tabpanel');
        await panel.getByRole('button', { name: items[index].options[0], exact: true }).click();
        await panel.getByRole('button', { name: 'Check', exact: true }).click();
        await expect(panel.getByRole('status')).toBeVisible();
        if (index < items.length - 1) {
          await check.getByRole('button', { name: 'Next', exact: true }).click();
          await expect(check.getByRole('heading', { name: wordPositionLabel(index + 1, 4) })).toBeVisible();
        }
      }
      await expect(check.getByText(/You got \d of 4 right\./)).toBeVisible();
      await check.getByRole('tab', { name: 'Go to word 1 of 4' }).click();
      const box = await check.getByRole('button', { name: items[0].options[0], exact: true }).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  } finally {
    await removeReadingLearner(admin, user);
  }
});

import { expect, test } from './helpers/isolated-test.mjs';
import { readFileSync } from 'node:fs';
import { answerReadingAndFinish, canUseReadingGateFixture, createReadingLearner, removeReadingLearner } from './helpers/reading-gate.mjs';

const content = JSON.parse(readFileSync(new URL('../../supabase-b1-b2/content/curriculum/reading-support-weeks-01-04.json', import.meta.url), 'utf8'));
const items = content.weeks.find((week) => week.week === 1).glossCheck;

test('reading context, two key words and tappable glosses appear before the questions, with no predict line', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const response = await page.goto('/week/1#reading-practice');
  expect(response.ok()).toBeTruthy();
  const reading = page.locator('#reading-practice');
  await expect(reading.getByText('Lucía is from Seville, in the south of Spain.', { exact: false })).toBeVisible();
  await expect(reading.getByRole('heading', { name: 'Two words to know' })).toBeVisible();

  // The old "Title: … First line: … ?" predict line is gone from the learner
  // page. It stays in the JSON for teachers (pinned by the unit test).
  const copy = await reading.textContent();
  expect(copy).not.toContain('First line:');
  expect(copy).not.toContain('Was she ready?');
  expect(await response.text()).not.toContain('Was she ready?');

  const square = reading.getByRole('button', { name: 'square', exact: true });
  await expect(square).toBeVisible();
  await square.click();
  await expect(reading.getByRole('dialog', { name: 'Meaning of square' })).toBeVisible();
  await expect(reading.getByText('an open public place in a town')).toBeVisible();
  await expect(reading.getByText('la plaza')).toBeVisible();

  // A green card word is highlighted, but is not a control and its meaning is
  // absent from the page until the saved-answer gate opens.
  await expect(reading.getByText('challenge', { exact: true })).toBeVisible();
  await expect(reading.getByRole('button', { name: 'challenge', exact: true })).toHaveCount(0);
  await expect(reading).not.toContainText('something new and difficult that needs effort');
  await expect(reading).not.toContainText('start to feel that something new is normal');
  await expect(page.getByRole('region', { name: 'Vocabulary practice' })).toBeVisible();
});

test('card meanings and the one-word-at-a-time gloss check open only after saved reading answers', async ({ page }) => {
  test.skip(!canUseReadingGateFixture, 'Needs a service-key test learner');
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 800 });
  const { admin, user } = await createReadingLearner(page, 'reading-support-gate');
  try {
    await page.goto('/week/1#reading-practice');
    const readingBeforeAnswer = page.locator('#reading-practice');
    await expect(readingBeforeAnswer).not.toContainText('something new and difficult that needs effort');
    await expect(readingBeforeAnswer.getByRole('button', { name: 'challenge', exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Vocabulary practice' })).toBeVisible();

    await answerReadingAndFinish(page);
    // Already on this URL: reload to get the server's unlocked card meanings.
    await page.reload();
    const reading = page.locator('#reading-practice');
    const card = reading.getByRole('button', { name: 'challenge', exact: true });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('aria-expanded', 'false');
    await card.focus();
    await page.keyboard.press('Enter');
    await expect(card).toHaveAttribute('aria-expanded', 'true');
    await expect(reading.getByRole('dialog', { name: 'Meaning of challenge' })).toBeVisible();
    await expect(reading.getByRole('dialog', { name: 'Meaning of challenge' })).toContainText('something new and difficult that needs effort');
    await page.keyboard.press('Escape');
    await expect(card).toBeFocused();

    await reading.getByText('Go further (2–3 min)', { exact: true }).click();
    const glossCheck = reading.locator('section[aria-labelledby="reading-gloss-check-heading"]');
    await expect(glossCheck.getByRole('heading', { name: 'Check four words' })).toBeVisible();
    await expect(glossCheck.getByRole('heading', { name: 'Word 1 of 4' })).toBeVisible();

    const before = await admin.from('week_input_submissions').select('week_number', { count: 'exact', head: true }).eq('user_id', user.id).eq('week_number', 1).eq('skill', 'reading');
    if (before.error) throw before.error;
    const answerResponse = page.waitForResponse((entry) => entry.url().endsWith('/api/week/reading/gloss'));
    const firstPanel = glossCheck.getByRole('tabpanel');
    await firstPanel.getByRole('button', { name: items[0].options[0], exact: true }).click();
    await firstPanel.getByRole('button', { name: 'Check', exact: true }).click();
    const checked = await answerResponse;
    expect(checked.status()).toBe(200);
    const result = await checked.json();
    expect(result).not.toHaveProperty('answerIndex');
    await expect(firstPanel.getByRole('status')).toBeVisible();

    const saved = await admin.from('week_input_answers').select('item_id,skill').eq('user_id', user.id).eq('week_number', 1).eq('skill', 'reading').eq('item_id', 'gloss-1-1').single();
    if (saved.error) throw saved.error;
    expect(saved.data).toEqual({ item_id: 'gloss-1-1', skill: 'reading' });
    const after = await admin.from('week_input_submissions').select('week_number', { count: 'exact', head: true }).eq('user_id', user.id).eq('week_number', 1).eq('skill', 'reading');
    if (after.error) throw after.error;
    expect(after.count).toBe(before.count);

    // Next moves one word at a time, every answer gets its one-line feedback,
    // and a short score ends the check.
    for (let index = 1; index < items.length; index += 1) {
      await glossCheck.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(glossCheck.getByRole('heading', { name: `Word ${index + 1} of 4` })).toBeVisible();
      const panel = glossCheck.getByRole('tabpanel');
      await panel.getByRole('button', { name: items[index].options[0], exact: true }).click();
      await panel.getByRole('button', { name: 'Check', exact: true }).click();
      await expect(panel.getByRole('status')).toBeVisible();
    }
    await expect(glossCheck.getByText(/You got \d of 4 right\./)).toBeVisible();
  } finally {
    await removeReadingLearner(admin, user);
  }
});

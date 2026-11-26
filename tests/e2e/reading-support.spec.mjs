import { expect, test } from './helpers/isolated-test.mjs';
import { answerReadingAndFinish, canUseReadingGateFixture, createReadingLearner, removeReadingLearner } from './helpers/reading-gate.mjs';

test('reading context, prediction, key words and tappable glosses appear before the questions', async ({ page }) => {
  const response = await page.goto('/week/1');
  expect(response.ok()).toBeTruthy();
  const reading = page.locator('#reading-practice');
  await expect(reading.getByText('Lucía is from Seville, in the south of Spain.', { exact: false })).toBeVisible();
  await expect(reading.getByText('Title: "Lucía\'s blog: A year in Manchester". First line:', { exact: false })).toBeVisible();
  await expect(reading.getByRole('heading', { name: 'Two words to know' })).toBeVisible();

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
  // The reading card words are highlighted, not interactive, and their
  // meanings are absent from the reading section until its server-side gate.
  await expect(reading).not.toContainText('something new and difficult that needs effort');
  await expect(reading).not.toContainText('start to feel that something new is normal');
  await expect(page.getByRole('region', { name: 'Vocabulary practice' })).toBeVisible();
});

test('card meanings and optional gloss check open only after saved reading answers; check is server-marked', async ({ page }) => {
  test.skip(!canUseReadingGateFixture, 'Needs a service-key test learner');
  test.setTimeout(180_000);
  const { admin, user } = await createReadingLearner(page, 'reading-support-gate');
  try {
    await page.goto('/week/1');
    const readingBeforeAnswer = page.locator('#reading-practice');
    await expect(readingBeforeAnswer).not.toContainText('something new and difficult that needs effort');
    await expect(readingBeforeAnswer.getByRole('button', { name: 'challenge', exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Vocabulary practice' })).toBeVisible();

    await answerReadingAndFinish(page);
    await page.goto('/week/1');
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

    const goFurther = reading.getByText('Go further (2–3 min)', { exact: true });
    await goFurther.click();
    const firstItem = reading.locator('details ol > li').first();
    const before = await admin.from('week_input_submissions').select('week_number', { count: 'exact', head: true }).eq('user_id', user.id).eq('week_number', 1).eq('skill', 'reading');
    if (before.error) throw before.error;
    const answerResponse = page.waitForResponse((entry) => entry.url().endsWith('/api/week/reading/gloss'));
    await firstItem.locator('input[type="radio"]').first().check();
    await firstItem.getByRole('button', { name: 'Check', exact: true }).click();
    const checked = await answerResponse;
    expect(checked.status()).toBe(200);
    const result = await checked.json();
    expect(result).not.toHaveProperty('answerIndex');
    await expect(firstItem.getByRole('status')).toBeVisible();

    const saved = await admin.from('week_input_answers').select('item_id,skill').eq('user_id', user.id).eq('week_number', 1).eq('skill', 'reading').eq('item_id', 'gloss-1-1').single();
    if (saved.error) throw saved.error;
    expect(saved.data).toEqual({ item_id: 'gloss-1-1', skill: 'reading' });
    const after = await admin.from('week_input_submissions').select('week_number', { count: 'exact', head: true }).eq('user_id', user.id).eq('week_number', 1).eq('skill', 'reading');
    if (after.error) throw after.error;
    expect(after.count).toBe(before.count);
  } finally {
    await removeReadingLearner(admin, user);
  }
});

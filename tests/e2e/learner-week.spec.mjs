import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const bank = JSON.parse(readFileSync(new URL('../fixtures/placement-questions-v2.json', import.meta.url)));
const details = JSON.parse(readFileSync(new URL('../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json', import.meta.url)));

test('learner week 1 renders safe content and opens the weekly labs without keys or models', async ({ page }) => {
  const response = await page.goto('/week/1');
  expect(response?.status()).toBe(200);
  await expect(page.getByText('Can-do goal:', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Reading:/ })).toBeVisible();
  await expect(page.getByText('Audio coming soon.')).toBeVisible();
  await expect(page.getByText(details.weeks[0].speaking.cueCard)).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain('"answer_index"');
  expect(html).not.toContain('"accepted"');
  expect(html).not.toContain('"reason"');
  expect(html).not.toContain(details.weeks[0].speaking.model);
  expect(html).not.toContain(details.weeks[0].writing.modelAnswer);
  await page.getByRole('link', { name: 'Open writing task in Labs' }).click();
  await expect(page).toHaveURL(/\/labs\?week=1#writing/);
  await expect(page.getByText(details.weeks[0].writing.prompt)).toBeVisible();
  await expect(page.getByText(details.weeks[0].speaking.prompt)).toBeVisible();
  const labsHtml = await page.content();
  expect(labsHtml).not.toContain(details.weeks[0].speaking.model);
  expect(labsHtml).not.toContain(details.weeks[0].writing.modelAnswer);
});

for (const [placement, score, target, label] of [
  ['foundation', 5, '/labs', 'Open Practice Labs'],
  ['stage1', 15, '/week/1', 'Start Week 1'],
  ['stage2', 22, '/week/17', 'Start Week 17'],
]) {
  test(`placement ${placement} button routes to ${target}`, async ({ page }) => {
    await page.route('**/api/placement/score', (route) => route.fulfill({ json: { score, total: 24, placement } }));
    await page.goto('/onboarding/placement');
    for (let i = 0; i < 24; i++) {
      await expect(page.getByRole('heading', { name: `Question ${i + 1} of 24` })).toBeVisible();
      await page.getByRole('button', { name: bank.questions[i].options[0], exact: true }).click();
      await page.getByRole('button', { name: i === 23 ? /Continue to Writing Sample/ : 'Next Question' }).click();
    }
    await page.getByRole('button', { name: 'Skip sample' }).click();
    await expect(page.getByText(`Suggested Band: ${placement === 'foundation' ? 'Foundation' : placement === 'stage1' ? 'Stage 1' : 'Stage 2'}`)).toBeVisible();
    await page.getByRole('button', { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${target.replace('/', '\\/')}(?:[?#]|$)`));
  });
}

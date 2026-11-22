import { test, expect } from '@playwright/test';

test('week vocabulary shows safe cards and exercise steps before reading', async ({ page }) => {
  const response = await page.goto('/week/1');
  expect(response.ok()).toBeTruthy();
  const html = await response.text();
  expect(html).not.toContain('It took me a few weeks to get used to working from home.');
  expect(html).not.toContain('answer_index');
  expect(html).not.toContain('onTargetWhen');
  const vocabulary = page.getByRole('region', { name: 'Vocabulary practice' });
  await expect(vocabulary.getByText('turning point', { exact: false }).first()).toBeVisible();
  await expect(vocabulary.getByText('Temporary voice').first()).toBeVisible();
  await expect(vocabulary.getByText(/Sign in to check/)).toBeVisible();
  await vocabulary.getByRole('button', { name: 'Next' }).click();
  await expect(vocabulary.getByText('Match each word to its meaning.')).toBeVisible();
  await expect(vocabulary.getByRole('button', { name: 'Check' }).first()).toBeDisabled();
  await vocabulary.getByRole('button', { name: 'Next' }).click();
  await expect(vocabulary.getByText(/Two years ago/)).toBeVisible();
  for (let i = 0; i < 3; i++) await vocabulary.getByRole('button', { name: 'Next' }).click();
  await expect(vocabulary.getByText(/first letters are given/)).toBeVisible();
  await vocabulary.getByRole('button', { name: 'Next' }).click();
  await expect(vocabulary.getByText(/Personal sentence feedback is coming soon/)).toBeVisible();
});

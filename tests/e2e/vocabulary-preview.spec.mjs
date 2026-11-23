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
  // The step header and the authored instruction can both start with the same
  // words, so assert on the exact authored line rather than a substring.
  await expect(vocabulary.getByText('Match each word to its meaning.', { exact: true })).toBeVisible();
  await expect(vocabulary.getByText('Step 2 of 7: Match')).toBeVisible();
  await expect(vocabulary.getByRole('button', { name: 'Check' }).first()).toBeDisabled();
  await vocabulary.getByRole('button', { name: 'Next' }).click();
  await expect(vocabulary.getByText(/Two years ago/)).toBeVisible();
  for (let i = 0; i < 3; i++) await vocabulary.getByRole('button', { name: 'Next' }).click();
  await expect(vocabulary.getByText(/first letters are given/)).toBeVisible();
  await vocabulary.getByRole('button', { name: 'Next' }).click();
  await expect(vocabulary.getByText(/Personal sentence feedback is coming soon/)).toBeVisible();
});

test('draft on-demand model route is not exposed', async ({ request }) => {
  const response = await request.post('/api/week/model', { data: { week: 1, skill: 'writing', confirmEarly: true } });
  expect(response.status()).toBe(404);
});

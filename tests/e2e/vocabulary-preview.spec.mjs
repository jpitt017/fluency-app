import { test, expect } from '@playwright/test';

test('week vocabulary shows safe cards and exercise steps before reading', async ({ page }) => {
  const response = await page.goto('/week/1');
  expect(response.ok()).toBeTruthy();
  const html = await response.text();
  expect(html).not.toContain('It took me a few weeks to get used to working from home.');
  expect(html).not.toContain('answer_index');
  expect(html).not.toContain('onTargetWhen');
  const vocabulary = page.getByRole('region', { name: 'Vocabulary practice' });
  // Step 1 pages the cards four at a time now, so page 1 holds the "Words to use"
  // group rather than everything. "turning point" is a recognition word and
  // lives on a later page; assert on a card that is actually on the first one.
  await expect(vocabulary.getByRole('heading', { name: 'Words to use' })).toBeVisible();
  await expect(vocabulary.getByText('challenge', { exact: false }).first()).toBeVisible();
  await expect(vocabulary.getByText('Temporary voice').first()).toBeVisible();
  await expect(vocabulary.getByText(/Sign in to check/)).toBeVisible();
  await vocabulary.getByRole('button', { name: 'Next', exact: true }).click();
  // The step header and the authored instruction can both start with the same
  // words, so assert on the exact authored line rather than a substring.
  await expect(vocabulary.getByText('Match each word to its meaning.', { exact: true })).toBeVisible();
  await expect(vocabulary.getByText('Step 2 of 7: Match')).toBeVisible();
  await expect(vocabulary.getByRole('button', { name: 'Check' }).first()).toBeDisabled();
  await vocabulary.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(vocabulary.getByText(/Two years ago/)).toBeVisible();
  for (let i = 0; i < 3; i++) await vocabulary.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(vocabulary.getByText(/first letters are given/)).toBeVisible();
  await vocabulary.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(vocabulary.getByText(/Personal sentence feedback is coming soon/)).toBeVisible();
});

test('draft on-demand model route is not exposed', async ({ request }) => {
  const response = await request.post('/api/week/model', { data: { week: 1, skill: 'writing', confirmEarly: true } });
  expect(response.status()).toBe(404);
});

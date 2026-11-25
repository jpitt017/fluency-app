import { test, expect } from '@playwright/test';

test('week card meanings and vocabulary practice stay closed until reading is answered', async ({ page }) => {
  const response = await page.goto('/week/1');
  expect(response.ok()).toBeTruthy();
  const html = await response.text();
  expect(html).not.toContain('It took me a few weeks to get used to working from home.');
  expect(html).not.toContain('answer_index');
  expect(html).not.toContain('onTargetWhen');

  // The green card words are present to support the X3 question, but neither
  // their definitions nor the broader vocabulary cards are sent yet.
  expect(html).not.toContain('something new and difficult that needs effort');
  expect(html).not.toContain('start to feel that something new is normal');
  expect(html).not.toContain('Words to use');
  await expect(page.getByRole('button', { name: 'challenge', exact: true })).toHaveCount(0);
  await expect(page.locator('#reading-practice').getByText('challenge', { exact: true })).toBeVisible();
  await expect(page.getByText('Finish and save the reading questions first')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Vocabulary practice' })).toHaveCount(0);
});

test('draft on-demand model route is not exposed', async ({ request }) => {
  const response = await request.post('/api/week/model', { data: { week: 1, skill: 'writing', confirmEarly: true } });
  expect(response.status()).toBe(404);
});

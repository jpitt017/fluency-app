import { openWeekTask } from './helpers/week-tasks.mjs';
import { test, expect } from './helpers/isolated-test.mjs';

test('reading card meanings stay gated while vocabulary practice remains available', async ({ page }) => {
  const response = await page.goto('/week/1#reading-practice');
  expect(response.ok()).toBeTruthy();
  const html = await response.text();
  expect(html).not.toContain('It took me a few weeks to get used to working from home.');
  expect(html).not.toContain('answer_index');
  expect(html).not.toContain('onTargetWhen');

  // The green card words are highlighted in the reading without exposing a
  // reading-card meaning. The vocabulary section itself remains usable.
  const reading = page.locator('#reading-practice');
  await expect(reading.getByRole('button', { name: 'challenge', exact: true })).toHaveCount(0);
  await expect(reading.getByText('challenge', { exact: true })).toBeVisible();
  await expect(reading).not.toContainText('something new and difficult that needs effort');
  await expect(page.getByRole('region', { name: 'Vocabulary practice' })).toBeVisible();
  await openWeekTask(page, 'vocabulary-practice');
  await expect(page.getByRole('heading', { name: 'Words to use' })).toBeVisible();
});

test('draft on-demand model route is not exposed', async ({ request }) => {
  const response = await request.post('/api/week/model', { data: { week: 1, skill: 'writing', confirmEarly: true } });
  expect(response.status()).toBe(404);
});

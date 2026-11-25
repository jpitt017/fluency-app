import { expect, test } from '@playwright/test';

test('login hides provider details and shows the B1 technical-error line', async ({ page }) => {
  let calls = 0;
  await page.route('**/auth/v1/token?grant_type=password', (route) => {
    calls += 1;
    return route.fulfill({ status: 400, json: { message: 'Internal authentication server configuration failed' } });
  });
  await page.goto('/login');
  await page.getByLabel(/Email/i).fill('learner@example.test');
  await page.getByLabel('Password', { exact: true }).fill('not-a-real-password');
  await page.getByRole('button', { name: /Sign in/i }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'Something went wrong.' });
  await expect(alert).toHaveText('Something went wrong. Please try again, or message your teacher.');
  await expect(alert).not.toContainText('configuration');
  expect(calls).toBe(1);
});

test('writing shows a simple network error but keeps an actionable daily-limit message', async ({ page }) => {
  const abort = (route) => route.abort('failed');
  await page.route('**/api/writing/correct', abort);
  await page.goto('/labs?week=1#writing');
  const writing = page.locator('#writing');
  await writing.locator('textarea').fill('Last year I moved to a new city and found a job. It was a big change for me.');
  await writing.getByRole('button', { name: 'Evaluate writing' }).click();
  await expect(writing.getByRole('alert')).toHaveText('We could not check your work. Please try again.');

  // Curated, actionable messages such as the daily limit should not be hidden.
  await page.unroute('**/api/writing/correct', abort);
  const limit = "You've done a lot of practice today! You can use the AI again tomorrow.";
  await page.route('**/api/writing/correct', (route) => route.fulfill({ status: 429, json: { error: limit } }));
  await writing.getByRole('button', { name: 'Evaluate writing' }).click();
  await expect(writing.getByRole('alert')).toHaveText(limit);
});

test('weekly writing keeps feedback but reports whether it counted', async ({ page }) => {
  let saved = false;
  await page.route('**/api/writing/correct', (route) => route.fulfill({ json: {
    corrected: 'A clearer sentence.', weekRecorded: saved,
  } }));
  await page.goto('/labs?week=1#writing');
  const writing = page.locator('#writing');
  await writing.locator('textarea').fill('Last year I moved to a new city and found a job. It was a big change for me.');
  await writing.getByRole('button', { name: 'Evaluate writing' }).click();
  await expect(writing.getByRole('alert')).toHaveText('We could not count this for Week 1. Please try again.');
  await expect(writing.getByText('A clearer sentence.')).toBeVisible();

  saved = true;
  await writing.getByRole('button', { name: 'Evaluate writing' }).click();
  await expect(writing.getByText('Saved for Week 1.')).toBeVisible();
  await expect(writing.getByRole('alert')).toHaveCount(0);
});

test('a signed-out review request asks the learner to sign in, without technical terms', async ({ request }) => {
  const response = await request.post('/api/srs/review', {
    data: { cardId: '1e3a92de-0df8-43dd-91e5-6843eb967330', cardType: 'vocab', grade: 'again' },
  });
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.error).toBe('Sign in to save your review.');
});

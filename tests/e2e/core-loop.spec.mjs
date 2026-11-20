import { expect, test } from '@playwright/test';

test.describe('B1 -> B2 Core Learning Loop', () => {
  test('public pages render curriculum, placement, and auth gates cleanly', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/B1|B2|Fluency/i);

    await page.goto('/curriculum/lessons/1');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.goto('/onboarding/placement');
    await expect(page.getByText(/Question 1 of/i)).toBeVisible();

    await page.goto('/review');
    await expect(page.getByText(/Sign in|Review|Mistake/i).first()).toBeVisible();
  });

  test('authenticated learner completes lesson -> writing -> feedback -> review loop', async ({ page }) => {
    const email = process.env.E2E_USER_EMAIL;
    const password = process.env.E2E_USER_PASSWORD;
    test.skip(!email || !password, 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run authenticated E2E flow');

    await page.goto('/login');
    await page.getByLabel(/Email/i).fill(email);
    await page.getByLabel(/Password/i).fill(password);
    await page.getByRole('button', { name: /Sign in/i }).click();
    await page.waitForURL(/\/dashboard|\/curriculum/);

    // Open Lesson 1 and run a writing submission
    await page.goto('/curriculum/lessons/1');
    const draftArea = page.getByPlaceholder(/Draft your paragraph/i);
    await expect(draftArea).toBeVisible();
    await draftArea.fill(
      'Moving to Edinburgh was turning point in my career. I was responsible of coordinating the design team, and I have started my role in 2023.',
    );

    const evalBtn = page.getByRole('button', { name: /Evaluate writing/i });
    await evalBtn.click();
    await expect(page.getByText(/\/ 100/)).toBeVisible({ timeout: 25_000 });

    // Visit /review and verify Mistake Repair card flow
    await page.goto('/review');
    await expect(page.getByText(/FSRS Mistake Repair|No error review cards due/i)).toBeVisible();
  });
});

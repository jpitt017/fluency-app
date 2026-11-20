import { expect, test } from '@playwright/test';

test.describe('B1 -> B2 Core Learning Loop', () => {
  test('public routes, privacy controls, and labs render cleanly', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/B1|B2|Fluency/i);

    await page.goto('/curriculum/lessons/1');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.goto('/labs');
    await expect(page.getByText(/Listen-and-Compare Shadowing Studio/i)).toBeVisible();
    await expect(page.getByText(/Prosody self-check checklist/i)).toBeVisible();

    await page.goto('/privacy');
    await expect(page.getByText(/Delete my learning data/i)).toBeVisible();

    await page.goto('/review');
    await expect(page.getByText(/Sign in|Review|Mistake/i).first()).toBeVisible();
  });

  test('placement check + stubbed diagnostic writing sample completes deterministically', async ({ page }) => {
    // Intercept writing feedback so placement works fast and deterministically in CI
    await page.route('**/api/writing/correct', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          score: 82,
          feedback: 'Clear B1+ structure with accurate tenses and natural connectors.',
          corrected: 'I want to reach B2 English to lead client workshops confidently.',
          notes: [],
          corrections: [],
          errorPatterns: [],
          rubric: { task_response: 4, organisation: 4, grammar_accuracy: 4, lexical_range: 4, style: 4 },
        }),
      });
    });

    await page.goto('/onboarding/placement');
    await expect(page.getByText(/Question 1 of/i)).toBeVisible();

    // Step through every placement item (24 in Supabase, or fallback count if offline)
    for (let i = 0; i < 30; i++) {
      const writingHeading = page.getByText(/Optional 1-Paragraph Diagnostic Writing Sample/i);
      if (await writingHeading.isVisible().catch(() => false)) {
        break;
      }
      const optionButtons = page.locator('div.space-y-2\\.5 > button');
      await optionButtons.first().click();
      await page.locator('button.w-full.rounded-xl.bg-indigo-700').click();
    }

    await expect(page.getByText(/Optional 1-Paragraph Diagnostic Writing Sample/i)).toBeVisible();
    await page
      .getByPlaceholder(/Write a short paragraph/i)
      .fill(
        'I want to reach B2 English so I can lead international workshops smoothly and explain technical trade-offs without pausing to translate.',
      );
    await page.getByRole('button', { name: /Evaluate Sample & Recommend Level/i }).click();

    await expect(page.getByText(/Placement Check Complete/i)).toBeVisible();
    await expect(page.getByText(/Writing 82\/100/i)).toBeVisible();
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

    await page.goto('/curriculum/lessons/1');
    const draftArea = page.getByPlaceholder(/Draft your paragraph/i);
    await expect(draftArea).toBeVisible();
    await draftArea.fill(
      'Moving to Edinburgh was turning point in my career. I was responsible of coordinating the design team, and I have started my role in 2023.',
    );

    const evalBtn = page.getByRole('button', { name: /Evaluate writing/i });
    await evalBtn.click();
    await expect(page.getByText(/\/ 100/)).toBeVisible({ timeout: 25_000 });

    await page.goto('/review');
    await expect(page.getByText(/FSRS Mistake Repair|No error review cards due/i)).toBeVisible();
  });
});

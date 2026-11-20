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
    await expect(page.getByText(/OpenAI/i)).toBeVisible();

    await page.goto('/review');
    await expect(page.getByText(/Sign in|Review|Mistake/i).first()).toBeVisible();
  });

  test('placement check + stubbed diagnostic writing sample completes deterministically', async ({ page }) => {
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

  test('authenticated learner completes lesson -> writing -> stubbed feedback -> review -> rewrite check', async ({
    page,
  }) => {
    const email = process.env.E2E_USER_EMAIL;
    const password = process.env.E2E_USER_PASSWORD;
    test.skip(!email || !password, 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run authenticated E2E flow');

    if (process.env.E2E_STUB_LLM !== 'false') {
      await page.route('**/api/writing/correct', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            submissionId: null,
            score: 74,
            feedback: 'Good effort! Watch article and preposition collocations.',
            corrected: 'Moving to Edinburgh was a turning point in my career.',
            notes: ['Use "a turning point" and "responsible for".'],
            corrections: [
              {
                original: 'Moving to Edinburgh was turning point in my career.',
                corrected_sentence: 'Moving to Edinburgh was a turning point in my career.',
                alternative: 'Moving to Edinburgh was a turning point in my career.',
                error_category: 'article',
                explanation: 'Use "a" before the singular countable noun "turning point".',
                reason: 'Use "a" before the singular countable noun "turning point".',
                severity: 'moderate',
              },
            ],
            errorPatterns: ['article'],
            rubric: { task_response: 4, organisation: 3.5, grammar_accuracy: 3.5, lexical_range: 4, style: 3.5 },
            newBadges: [],
          }),
        });
      });
    }

    await page.goto('/login');
    await page.getByLabel(/Email/i).fill(email);
    await page.getByLabel(/Password/i).fill(password);
    await page.getByRole('button', { name: /Sign in/i }).click();
    await page.waitForURL(/\/dashboard|\/curriculum/);

    await page.goto('/curriculum/lessons/1');
    const draftArea = page.getByPlaceholder(/Draft your paragraph/i);
    await expect(draftArea).toBeVisible();
    await draftArea.fill('Moving to Edinburgh was turning point in my career.');

    await page.getByRole('button', { name: /Evaluate writing/i }).click();
    await expect(page.getByText(/74 \/ 100|\/ 100/)).toBeVisible({ timeout: 20_000 });

    await page.goto('/review');
    await expect(page.getByText(/FSRS Mistake Repair|No error review cards due/i)).toBeVisible();
  });
});

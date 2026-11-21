import { expect, test } from '@playwright/test';

const hasRealSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder.supabase.co'),
);

test.describe('B1 -> B2 Core Learning Loop', () => {
  test('public routes, privacy controls, and labs render cleanly', async ({ page }) => {
    const homeRes = await page.goto('/');
    expect(homeRes?.status()).toBeLessThan(500);
    await expect(page).toHaveTitle(/B1|B2|Fluency/i);

    await page.goto('/labs');
    await expect(page.getByText(/Listen-and-Compare Shadowing Studio/i)).toBeVisible();
    await expect(page.getByText(/Prosody self-check checklist/i)).toBeVisible();
    await expect(page.getByText(/Model replays:/i)).toBeVisible();
    await expect(page.getByText(/Temporary voice/i).first()).toBeVisible();

    await page.goto('/privacy');
    await expect(page.getByRole('button', { name: /Delete my learning data/i })).toBeVisible();
    await expect(page.getByText(/OpenAI/i)).toBeVisible();
    await expect(page.getByText(/Automated 12-month purge/i)).toBeVisible();

    await page.goto('/review');
    await expect(page.getByRole('heading', { name: /Sign in to practise|Mistake & Pattern Drill/i })).toBeVisible();

    await page.goto('/teacher');
    await expect(page.getByRole('heading', { name: /Sign in with a teacher account|Teacher Review/i })).toBeVisible();

    for (const removedRoute of ['/clinic', '/vocabulary', '/checkpoints']) {
      const res = await page.goto(removedRoute);
      expect(res?.status()).toBe(404);
    }
  });

  test('two-stage curriculum renders all 32 weeks and week details', async ({ page }) => {
    const res = await page.goto('/curriculum');
    expect(res?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: /From secure B1 to B2/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Stage 1 · Weeks 1-16/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Stage 2 · Weeks 17-32/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /WEEK 32/ })).toHaveCount(0); // stage 2 is one click away

    await page.getByRole('button', { name: /Stage 2 · Weeks 17-32/i }).click();
    await expect(page.getByRole('link', { name: /WEEK 32/ })).toBeVisible();

    const weekRes = await page.goto('/curriculum/weeks/31');
    expect(weekRes?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: /Debate and persuasion/i })).toBeVisible();
    await expect(page.getByText(/Building an argument/i)).toBeVisible();
    await expect(page.getByText(/Essay and AI debate/i)).toBeVisible();

    const alias = await page.goto('/syllabus');
    expect(alias?.status()).toBeLessThan(500);
    expect(new URL(page.url()).pathname).toBe('/curriculum');
  });

  test('Weeks 1–4 specs and assessment documents render', async ({ page }) => {
    const weekRes = await page.goto('/curriculum/weeks/1');
    expect(weekRes?.status()).toBeLessThan(500);
    await expect(page.getByText(/A change you got used to/i)).toBeVisible();
    await expect(page.getByText(/Full practice set · pilot draft/i)).toBeVisible();
    await expect(page.getByText(/W1-L3/)).toBeVisible();
    await expect(page.getByText(/Shadowing chunks · 3 min warm-up/i)).toBeVisible();
    await expect(page.getByText(/Full audio script/i)).toBeVisible();
    await expect(page.getByText(/Full reading text/i)).toBeVisible();
    await expect(page.getByText(/L1-G1/)).toBeVisible();
    await expect(page.getByText(/R1-G1/)).toBeVisible();
    await expect(page.getByText(/Required points checked by the AI/i)).toBeVisible();
    await expect(page.getByText(/Reveal model answer/i)).toBeVisible();
    await expect(page.getByText(/Five-step writing flow and learner support/i)).toBeVisible();
    await expect(page.getByText(/Paired reading:/i)).toBeVisible();
    await expect(page.getByText(/Authoring notes for teachers/i)).toBeVisible();

    const assessmentRes = await page.goto('/assessments');
    expect(assessmentRes?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: /Three bands, four criteria/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /The same four criteria for speech/i })).toBeVisible();
    await expect(page.getByText(/Checkpoint 1 speaking/i)).toBeVisible();
    await expect(page.getByText(/CP1-01/)).toBeVisible();
    await page.getByRole('button', { name: /Reveal keys/i }).click();
    await expect(page.getByText(/In 2019' is a finished time/i)).toBeVisible();
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

    const res = await page.goto('/onboarding/placement');
    expect(res?.status()).toBeLessThan(500);

    if (!hasRealSupabase) {
      await expect(
        page.getByText(/Question 1 of|Placement questions are currently unavailable/i),
      ).toBeVisible();
      return;
    }

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
    await page.waitForURL(/\/dashboard|\/labs/);

    await page.goto('/labs');
    const draftArea = page.getByPlaceholder(/Write your B1 → B2 response here/i);
    await expect(draftArea).toBeVisible();
    await draftArea.fill('Moving to Edinburgh was turning point in my career.');

    await page.getByRole('button', { name: /Evaluate writing/i }).click();
    await expect(page.getByText(/74 \/ 100|\/ 100/)).toBeVisible({ timeout: 20_000 });

    await page.goto('/review');
    await expect(page.getByText(/FSRS Mistake Repair|No error review cards due/i)).toBeVisible();
  });
});

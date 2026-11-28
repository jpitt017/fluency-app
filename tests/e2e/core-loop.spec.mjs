import { expect, test } from './helpers/isolated-test.mjs';

async function signIn(page, email, password) {
  await page.goto('/login');
  await page.getByLabel(/Email/i).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /Sign in/i }).click();
  await page.waitForURL(/\/dashboard|\/labs|\/teacher/);
}

const hasRealSupabase = Boolean(
  process.env.E2E_SUPABASE_URL &&
    !process.env.E2E_SUPABASE_URL.includes('placeholder.supabase.co'),
);

test.describe('B1 -> B2 Core Learning Loop', () => {
  test('unreleased speaking audio uses the temporary computer voice fallback', async ({ page }) => {
    // Week 32 has no authored/released audio, so the studio must show its
    // browser-voice fallback regardless of live release state for Weeks 1–4.
    await page.goto('/labs?week=32');
    await expect(page.getByText(/Temporary computer voice/i).first()).toBeVisible();
  });

  test('public routes, privacy controls, and labs render cleanly', async ({ page }) => {
    const homeRes = await page.goto('/');
    expect(homeRes?.status()).toBeLessThan(500);
    await expect(page).toHaveTitle(/B1|B2|Fluency/i);

    // A released recording may now be available. Block audio so the fallback
    // is exercised in either case and must be labelled for all learners.
    await page.route('**/*.mp3*', (route) => route.abort());
    await page.goto('/labs');
    await expect(page.getByText(/Pronunciation practice/i).first()).toBeVisible();
    await expect(page.getByText(/Check your pronunciation/i)).toBeVisible();
    await expect(page.getByText(/Speaker plays:/i)).toBeVisible();
    const listen = page.getByRole('button', { name: 'Listen to the sentence', exact: true });
    await listen.click();
    await expect(listen).toHaveAttribute('aria-describedby', 'shadowing-temporary-voice');
    await expect(page.locator('#shadowing-temporary-voice')).toHaveText('Temporary computer voice');
    await page.unroute('**/*.mp3*');

    await page.goto('/privacy');
    await expect(page.getByRole('button', { name: /Delete my learning data/i })).toBeVisible();
    await expect(page.getByText(/OpenAI/i)).toBeVisible();
    await expect(page.getByText(/Automated 12-month purge/i)).toBeVisible();

    await page.goto('/review');
    await expect(page.getByRole('heading', { name: /Sign in to practise|Practise your mistakes/i })).toBeVisible();

    await page.goto('/teacher');
    await expect(page.getByRole('heading', { name: /Sign in with a teacher account|Teacher Review/i })).toBeVisible();

    for (const removedRoute of ['/clinic', '/vocabulary', '/checkpoints']) {
      const res = await page.goto(removedRoute);
      expect(res?.status()).toBe(404);
    }
  });

  test('teacher-only routes redirect signed-out visitors and expose no answer keys', async ({ page }) => {
    for (const route of ['/curriculum', '/curriculum/weeks/1', '/syllabus', '/assessments']) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
      const html = await page.content();
      expect(html).not.toContain('"key"');
      expect(html).not.toContain('CP1-01');
    }
  });

  test('signed-in learners are redirected from teacher-only routes with no key data', async ({ page }) => {
    const email = process.env.E2E_USER_EMAIL;
    const password = process.env.E2E_USER_PASSWORD;
    test.skip(!email || !password, 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run the learner gate test');

    await signIn(page, email, password);

    for (const route of ['/assessments', '/curriculum']) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/dashboard|\/login/);
      const html = await page.content();
      expect(html).not.toContain('"key"');
      expect(html).not.toContain('CP1-01');
    }

    for (const endpoint of ['/api/checkpoints/portfolio', '/api/checkpoints/recording/no-such-attempt']) {
      const response = await page.request.get(endpoint);
      const body = await response.text();
      expect(body).not.toContain('"key"');
    }
  });

  test('learners see Week 4 CEFR content and mediation without reaching teacher routes', async ({ page }) => {
    const email = process.env.E2E_USER_EMAIL;
    const password = process.env.E2E_USER_PASSWORD;
    test.skip(!email || !password, 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run the learner CEFR test');

    await page.route('**/api/mediation/feedback', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          criteria: [
            { label: 'Task fulfilment', note: 'You included the three places and the tip.' },
            { label: 'Clarity for the reader', note: 'The advice is easy to follow.' },
            { label: 'Language accuracy', note: 'The language is clear.' },
            { label: 'Organisation', note: 'Your points are well ordered.' },
          ],
          readerNeed: 'Yes — your friend knows what to see and do.',
          feedback: 'Good mediation practice.',
          suggestion: 'Add one practical detail next time.',
        }),
      });
    });

    await signIn(page, email, password);

    await page.goto('/dashboard?week=4');
    await expect(page.getByText(/By the end of this week I can/i)).toBeVisible();
    await expect(
      page.getByText(/recommend a place I know, separating facts about it from my own experience/i),
    ).toBeVisible();

    await page.goto('/labs?week=4');
    await expect(page.getByText(/word stress in featured words and -ed endings/i).first()).toBeVisible();

    await page.goto('/review?week=4');
    await expect(page.getByText(/A friend is visiting your town and missed the travel guide/i)).toBeVisible();
    await expect(page.getByText(/Does not affect unlocking/i)).toBeVisible();
    await page.getByRole('button', { name: /Type instead/i }).click();
    await page
      .getByPlaceholder(/Write your voice message/i)
      .fill('Do not miss the cathedral, the harbour and the old quarter. Take the train, not a taxi.');
    await page.getByRole('button', { name: /Get mediation feedback/i }).click();
    await expect(page.getByText(/Did the reader get what they need/i)).toBeVisible();

    for (const route of ['/curriculum', '/assessments']) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/dashboard|\/login/);
    }
  });

  test('teachers can open the curriculum and assessment authoring documents', async ({ page }) => {
    const email = process.env.E2E_TEACHER_EMAIL;
    const password = process.env.E2E_TEACHER_PASSWORD;
    test.skip(!email || !password, 'Set E2E_TEACHER_EMAIL and E2E_TEACHER_PASSWORD to run the teacher authoring test');

    await signIn(page, email, password);

    const res = await page.goto('/curriculum');
    expect(res?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: /From secure B1 to B2/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Stage 1 · Weeks 1-16/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Stage 2 · Weeks 17-32/i })).toBeVisible();

    const weekRes = await page.goto('/curriculum/weeks/1');
    expect(weekRes?.status()).toBeLessThan(500);
    await expect(page.getByText(/Full practice set · pilot draft/i)).toBeVisible();
    await expect(page.getByText(/W1-L3/)).toBeVisible();
    await expect(page.getByText(/Authoring notes for teachers/i)).toBeVisible();

    const assessmentRes = await page.goto('/assessments');
    expect(assessmentRes?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: /Three bands, four criteria/i })).toBeVisible();
    await expect(page.getByText(/CP1-01/)).toBeVisible();
  });

  test('placement check + stubbed diagnostic writing sample completes deterministically', async ({ page }) => {
    await page.route('**/api/placement/score', (route) => route.fulfill({ json: { score: 15, total: 24, placement: 'stage1' } }));
    await page.route('**/api/writing/correct', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          feedback: 'Clear B1+ structure with accurate tenses and natural connectors.',
          corrected: 'I want to reach B2 English to lead client workshops confidently.',
          notes: [],
          corrections: [],
          errorPatterns: [],
          areas: {
            content: { score: 4, strength: 'Clear goals.', improvement: 'Add one example.' },
            communicative_achievement: { score: 4, strength: 'Natural tone.', improvement: 'Keep this style.' },
            organisation: { score: 4, strength: 'Logical flow.', improvement: 'Use one more linker.' },
            language: { score: 4, strength: 'Good vocabulary.', improvement: 'Check verb forms.' },
          },
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
      const writingHeading = page.getByText(/Write a short text \(optional\)/i);
      if (await writingHeading.isVisible().catch(() => false)) {
        break;
      }
      await page.getByTestId('placement-option').first().click();
      await page.getByTestId('placement-continue').click();
    }

    await expect(page.getByText(/Write a short text \(optional\)/i)).toBeVisible();
    await page
      .getByRole('textbox')
      .fill(
        'I want to reach B2 English so I can lead international workshops smoothly and explain technical trade-offs without pausing to translate.',
      );
    await page.getByRole('button', { name: /Evaluate Sample & Recommend Level/i }).click();

    await expect(page.getByText(/Placement Check Complete/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Content 4\/5/i)).toBeVisible();
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
            areas: {
              content: { score: 4, strength: 'Clear main idea.', improvement: 'Add a detail.' },
              communicative_achievement: { score: 4, strength: 'Suitable style.', improvement: 'Keep tone steady.' },
              organisation: { score: 3, strength: 'Sensible order.', improvement: 'Link sentences smoothly.' },
              language: { score: 3, strength: 'Good words.', improvement: 'Add missing articles.' },
            },
            newBadges: [],
          }),
        });
      });
    }

    await signIn(page, email, password);

    await page.goto('/labs');
    const draftArea = page.getByPlaceholder(/Write your B1 → B2 response here/i);
    await expect(draftArea).toBeVisible();
    await draftArea.fill('Moving to Edinburgh was turning point in my career.');

    await page.getByRole('button', { name: /Evaluate writing/i }).click();
    await expect(page.getByText('4 / 5').first()).toBeVisible({ timeout: 20_000 });

    await page.goto('/review');
    await expect(page.getByText(/Practise your mistakes|Nothing to practise today/i).first()).toBeVisible();
  });
});

test('all AI endpoints reject signed-out requests', async ({ request }) => {
  for (const endpoint of ['/api/speaking/chat', '/api/speaking/evaluate', '/api/speaking/transcribe', '/api/writing/correct', '/api/mediation/feedback', '/api/review/check-rewrite']) {
    const response = await request.post(endpoint, { data: {} });
    expect(response.status(), `${endpoint} must require authentication`).toBe(401);
  }
});

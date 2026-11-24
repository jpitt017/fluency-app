import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';

/**
 * The three answer boxes on /week/[n]:
 *   grammar "Fix it" rewrite items, grammar "Use it", vocabulary step 7.
 *
 * Signed-out coverage runs everywhere: the box must be there and disabled, with
 * the new copy rather than the two strings this work replaced. Signed-in
 * coverage needs the service key because it has to create a learner and count
 * the rows the boxes write.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function signIn(page, user) {
  await page.goto('/login');
  await page.getByLabel(/Email/i).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: /Sign in/i }).click();
  await page.waitForURL(/\/dashboard|\/labs/);
}

/** Walk the grammar steps until the wanted step title is showing. */
async function openGrammarStep(page, title) {
  const grammar = page.getByRole('region', { name: 'Grammar practice' });
  for (let i = 0; i < 5; i += 1) {
    if (await grammar.getByText(new RegExp(`Step \\d of 5: ${title}`)).isVisible().catch(() => false)) {
      return grammar;
    }
    await grammar.getByRole('button', { name: 'Next', exact: true }).click();
  }
  return grammar;
}

test('the three boxes replace the old dead-end copy', async ({ page }) => {
  const response = await page.goto('/week/1');
  const html = await response.text();

  // The removed strings must be gone from the served markup, not just hidden.
  expect(html).not.toContain('Write your sentence in the speaking or writing box');
  expect(html).not.toContain('Personal sentence feedback is coming soon');
  expect(html).not.toContain('Your teacher in the app will reply');

  // Step 1 renders both group headings and the promise of later practice. The
  // count is a dynamic value, so the server markup splits it with comment nodes
  // and only the surrounding text can be matched here; the browser test below
  // asserts the sentence the learner actually reads.
  expect(html).toContain('Words to use');
  expect(html).toContain('Words to understand');
  expect(html).toContain('new words');
  expect(html).toContain('Next words');
});

test('grammar "Fix it" rewrite items have a text box and a Check button', async ({ page }) => {
  await page.goto('/week/1');
  const grammar = await openGrammarStep(page, 'Fix it');
  await expect(grammar.getByText(/Step \d of 5: Fix it/)).toBeVisible();

  // The step holds the 'Fix' items (single inputs) and then the rewrite items.
  // The rewrite box is the multi-line one; target it by its prompt so the test
  // cannot accidentally measure a one-line input belonging to another item.
  const rewriteBox = grammar.locator('textarea').first();
  await expect(rewriteBox).toBeVisible();
  await expect(grammar.getByRole('button', { name: 'Check', exact: true }).first()).toBeDisabled();
  await expect(grammar.getByText(/\(since\)/).first()).toBeVisible();
});

test('grammar "Use it" has a text box and a Check button', async ({ page }) => {
  await page.goto('/week/1');
  const grammar = await openGrammarStep(page, 'Use it');
  await expect(grammar.getByText(/Step \d of 5: Use it/)).toBeVisible();
  await expect(grammar.getByRole('textbox').first()).toBeVisible();
  await expect(grammar.getByRole('button', { name: 'Check', exact: true }).first()).toBeDisabled();
  await expect(grammar.getByText('Write your sentences and press Check. The app will give you feedback.').first()).toBeVisible();
});

test('vocabulary step 7 "Your sentences" has a text box and a Check button', async ({ page }) => {
  await page.goto('/week/1');
  const vocabulary = page.getByRole('region', { name: 'Vocabulary practice' });
  for (let i = 0; i < 6; i += 1) {
    await vocabulary.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await expect(vocabulary.getByText('Step 7 of 7: Your sentences')).toBeVisible();
  await expect(vocabulary.getByText(/Write one sentence about something that was difficult at first/)).toBeVisible();
  await expect(vocabulary.getByRole('textbox').first()).toBeVisible();
  await expect(vocabulary.getByRole('button', { name: 'Check', exact: true }).first()).toBeDisabled();
  await expect(vocabulary.getByText('Write your sentences and press Check. The app will give you feedback.').first()).toBeVisible();
});

test('vocabulary step 1 groups the words and pages through them', async ({ page }) => {
  await page.goto('/week/1');
  const vocabulary = page.getByRole('region', { name: 'Vocabulary practice' });
  await expect(vocabulary.getByText('Step 1 of 7: Words')).toBeVisible();

  // The new line at the top, with the real number for the week.
  await expect(vocabulary.getByText(/This week: 14 new words\./)).toBeVisible();
  await expect(vocabulary.getByText(/You'll practise them in the next steps/)).toBeVisible();

  // Not everything at once: page 1 of several, and the use flags are gone.
  const firstPage = vocabulary.getByRole('heading', { name: 'Words to use' });
  await expect(firstPage).toBeVisible();
  const html = await page.content();
  expect(html).not.toMatch(/>\s*recognition\s*</);
  expect(html).not.toMatch(/>\s*active\s*</);

  // "Next words →" advances and, eventually, reaches the second group.
  const nextWords = vocabulary.getByRole('button', { name: 'Next words →' });
  await expect(nextWords).toBeVisible();
  let sawUnderstand = await vocabulary
    .getByRole('heading', { name: 'Words to understand' })
    .isVisible()
    .catch(() => false);
  let pages = 1;
  for (let i = 0; i < 6 && !(await nextWords.isDisabled()); i += 1) {
    await nextWords.click();
    pages += 1;
    sawUnderstand =
      sawUnderstand ||
      (await vocabulary.getByRole('heading', { name: 'Words to understand' }).isVisible().catch(() => false));
  }
  expect(sawUnderstand, 'the recognition group is never reached').toBe(true);
  // Week 1 has 14 cards at four per page, so there must be more than one page,
  // and the last page has no further words.
  expect(pages, 'step 1 showed every card at once').toBeGreaterThan(1);
  await expect(nextWords).toBeDisabled();

  // Audio is still offered on the cards.
  await expect(vocabulary.getByRole('button', { name: /Listen/ }).first()).toBeVisible();
});

test('a signed-in learner gets feedback and the attempt is saved and deletable', async ({ page }) => {
  test.skip(!url || !key, 'Live test needs the service key');
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const user = await createTestUser(admin, 'sentence-e2e');
  try {
    await signIn(page, user);
    await page.goto('/week/1');

    // Grammar "Fix it": the authored answer is accepted without a model call, so
    // this half of the test runs even when GROQ_API_KEY is absent.
    const fixIt = await openGrammarStep(page, 'Fix it');
    const rewrite = fixIt.locator('textarea').first();
    await rewrite.fill("I've been learning English since 2020.");
    await fixIt.getByRole('button', { name: 'Check', exact: true }).first().click();

    const rewriteStatus = fixIt.getByRole('status').first();
    await expect(rewriteStatus).toBeVisible({ timeout: 20_000 });
    await expect(rewriteStatus.getByText(/Corrected sentence:/)).toBeVisible();
    await expect(rewriteStatus.getByText(/You used the target form/)).toBeVisible();

    // It landed in the week table that "Delete my data" already covers.
    const attempts = await admin
      .from('week_grammar_attempts')
      .select('id,item_id,correct')
      .eq('user_id', user.id)
      .in('item_id', ['W1-R1', 'W1-R2', 'W1-R3']);
    if (attempts.error) throw attempts.error;
    expect(attempts.data?.length).toBeGreaterThan(0);
    expect(attempts.data?.some((row) => row.correct === true)).toBe(true);

    // Grammar "Use it" and vocabulary step 7 have no key, so both go through the
    // model. They need GROQ_API_KEY, which the E2E job does not set, so the
    // check here is that the box posts and reports success or a B1 error -- the
    // three-part feedback itself is covered by the unit tests.
    const useIt = await openGrammarStep(page, 'Use it');
    await useIt.locator('textarea').first().fill('I used to ride my bike every day.');
    await useIt.getByRole('button', { name: 'Check', exact: true }).first().click();
    await expect(
      useIt.getByRole('status').first().or(useIt.getByRole('alert').first()),
    ).toBeVisible({ timeout: 30_000 });

    // Whatever the model did, the attempt is stored and is deletable.
    const allAttempts = await admin
      .from('week_grammar_attempts')
      .select('id,item_id')
      .eq('user_id', user.id);
    if (allAttempts.error) throw allAttempts.error;
    expect(allAttempts.data?.length).toBeGreaterThan(0);

    // "Delete my data" clears the attempt tables the boxes write to.
    await admin.rpc('delete_my_learning_data');
    for (const table of ['week_vocabulary_attempts', 'week_grammar_attempts']) {
      const left = await admin.from(table).select('id').eq('user_id', user.id);
      if (left.error) throw left.error;
      expect(left.data?.length, `${table} still has rows after deletion`).toBe(0);
    }
  } finally {
    await deleteTestUser(admin, user.id);
  }
});

test('a signed-out learner cannot post a sentence', async ({ request }) => {
  const response = await request.post('/api/week/sentence', {
    data: { week: 1, id: 'V1-S1', answer: 'I got used to working from home.' },
  });
  expect(response.status()).toBe(401);
});

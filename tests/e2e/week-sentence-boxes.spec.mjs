import { test, expect } from './helpers/isolated-test.mjs';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';
import { canUseReadingGateFixture, createReadingLearner, removeReadingLearner } from './helpers/reading-gate.mjs';

/**
 * The three answer boxes on /week/[n]:
 *   grammar "Fix it" rewrite items, grammar "Use it", vocabulary step 7.
 *
 * The reading card-meaning gate is independent of the vocabulary practice
 * section, so vocabulary navigation can be exercised without completing the
 * reading questions.
 */
const url = process.env.E2E_SUPABASE_URL;
const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;

/**
 * Walk the grammar steps until the wanted step title is showing.
 *
 * The header is asserted first: without it the first loop iteration runs before
 * the page has rendered, reads "not visible", clicks Next and skips past the
 * step it was looking for -- which is how this skipped "Fix it" and hung.
 */
async function openGrammarStep(page, title) {
  const grammar = page.getByRole('region', { name: 'Grammar practice' });
  await expect(grammar.getByText(/Step \d of 5: /)).toBeVisible();
  for (let i = 0; i < 5; i += 1) {
    if (await grammar.getByText(new RegExp(`Step \\d of 5: ${title}`)).isVisible()) return grammar;
    await grammar.getByRole('button', { name: 'Next step', exact: true }).click();
  }
  await expect(grammar.getByText(new RegExp(`Step \\d of 5: ${title}`))).toBeVisible();
  return grammar;
}

test('the three boxes replace the old dead-end copy', async ({ page }) => {
  const response = await page.goto('/week/1');
  const html = await response.text();

  // The removed strings must be gone from the served markup, not just hidden.
  expect(html).not.toContain('Write your sentence in the speaking or writing box');
  expect(html).not.toContain('Personal sentence feedback is coming soon');
  expect(html).not.toContain('Your teacher in the app will reply');

  // Vocabulary practice remains available; only the reading-card meaning is
  // withheld until all reading answers have been checked and saved.
  expect(html).toContain('Words to use');
  await expect(page.getByRole('region', { name: 'Vocabulary practice' })).toBeVisible();
});

test('grammar "Fix it" rewrite items have a text box and a Check button', async ({ page }) => {
  await page.goto('/week/1');
  const grammar = await openGrammarStep(page, 'Fix it');
  await expect(grammar.getByText(/Step \d of 5: Fix it/)).toBeVisible();

  // Three repair items come first, followed by the separate rewrite items.
  // Open the first rewrite before testing its multi-line box.
  await grammar.getByRole('tab', { name: 'Go to item 4 of 6' }).click();
  const rewriteBox = grammar.getByRole('textbox');
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
  await expect(grammar.locator('p:visible').filter({ hasText: 'Write your sentences and press Check. The app will give you feedback.' }).first()).toBeVisible();
});

test('vocabulary step 7 has a text box and Check button', async ({ page }) => {
  test.skip(!canUseReadingGateFixture, 'Signed-in vocabulary UI needs a service-key test user');
  test.setTimeout(180_000);
  const { admin, user } = await createReadingLearner(page, 'sentence-vocab-step7');
  try {
    await page.goto('/week/1');
    const vocabulary = page.getByRole('region', { name: 'Vocabulary practice' });
    for (let i = 0; i < 6; i += 1) {
      await vocabulary.getByRole('button', { name: 'Next step', exact: true }).click();
    }
    await expect(vocabulary.getByText('Step 7 of 7: Your sentences')).toBeVisible();
    await expect(vocabulary.getByText('Write about something that was difficult at first, but now feels normal.')).toBeVisible();
    await expect(vocabulary.getByRole('textbox').first()).toBeVisible();
    await expect(vocabulary.getByRole('button', { name: 'Check', exact: true }).first()).toBeDisabled();
    await expect(vocabulary.getByText('Write your sentences and press Check. The app will give you feedback.').first()).toBeVisible();
  } finally {
    await removeReadingLearner(admin, user);
  }
});

test('vocabulary step 1 groups the words and pages through them', async ({ page }) => {
  test.skip(!canUseReadingGateFixture, 'Signed-in vocabulary UI needs a service-key test user');
  test.setTimeout(180_000);
  const { admin, user } = await createReadingLearner(page, 'sentence-vocab-step1');
  try {
    await page.goto('/week/1');
    const vocabulary = page.getByRole('region', { name: 'Vocabulary practice' });
    await expect(vocabulary.getByText('Step 1 of 7: Words')).toBeVisible();
    await expect(vocabulary.getByText(/This week: 14 new words\./)).toBeVisible();
    await expect(vocabulary.getByText(/You'll practise them in the next steps/)).toBeVisible();
    const firstPage = vocabulary.getByRole('heading', { name: 'Words to use' });
    await expect(firstPage).toBeVisible();
    const html = await page.content();
    expect(html).not.toMatch(/>\s*recognition\s*</);
    expect(html).not.toMatch(/>\s*active\s*</);

    const nextWords = vocabulary.getByRole('button', { name: 'Next words →' });
    await expect(nextWords).toBeVisible();
    let sawUnderstand = await vocabulary.getByRole('heading', { name: 'Words to understand' }).isVisible().catch(() => false);
    let pages = 1;
    for (let i = 0; i < 6 && !(await nextWords.isDisabled()); i += 1) {
      await nextWords.click();
      pages += 1;
      sawUnderstand = sawUnderstand || (await vocabulary.getByRole('heading', { name: 'Words to understand' }).isVisible().catch(() => false));
    }
    expect(sawUnderstand, 'the recognition group is never reached').toBe(true);
    expect(pages, 'step 1 showed every card at once').toBeGreaterThan(1);
    await expect(nextWords).toBeDisabled();
    await expect(vocabulary.getByRole('button', { name: /Listen/ }).first()).toBeVisible();
  } finally {
    await removeReadingLearner(admin, user);
  }
});

/**
 * The signed-in half of the box behaviour is tested against the route, not
 * through the browser.
 *
 * The browser assertions above already prove the boxes render, are wired to the
 * route, and are disabled when signed out. What remains is server behaviour --
 * an authored answer is accepted without a model call, the attempt is stored in
 * the tables "Delete my data" clears, a miss creates a Review card -- and that is
 * both faster and far more reliable to assert directly. A first attempt did it
 * through the UI and hung on the sign-in/session dance for reasons the CI
 * annotation could not report.
 */
test('the sentence route accepts an authored answer, saves it, and deletion clears it', async ({ page }) => {
  test.skip(!url || !key, 'Live test needs the service key');
  // Sign-in plus several round trips to live Supabase.
  test.setTimeout(150_000);
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const user = await createTestUser(admin, 'sentence-api');
  try {
    // The route reads the session from cookies, as every server component does,
    // so it has to be signed in through the browser. page.request shares the
    // page's cookie jar, which is what makes the calls below authenticated.
    await page.goto('/login');
    await page.getByLabel(/Email/i).fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: /Sign in/i }).click();
    await page.waitForURL(/\/dashboard|\/labs/, { timeout: 60_000 });
    const request = page.request;

    // Week 1's rewrite item W1-R1: the authored answer must be accepted
    // deterministically, with no model call and therefore no AI unit spent.
    const accepted = await request.post('/api/week/sentence', {
      data: { week: 1, id: 'W1-R1', answer: "I've been learning English since 2020." },
    });
    expect(accepted.status()).toBe(200);
    const body = await accepted.json();
    expect(body.onTarget).toBe(true);
    expect(body.checkedWith).toBe('target-form');
    expect(typeof body.good).toBe('string');
    expect(typeof body.corrected).toBe('string');
    expect(typeof body.tip).toBe('string');
    expect(body.addedToReview).toBe(false);

    // The full form of the same answer is also accepted.
    const fullForm = await request.post('/api/week/sentence', {
      data: { week: 1, id: 'W1-R1', answer: 'I have been learning English since 2020.' },
    });
    expect(fullForm.status()).toBe(200);
    expect((await fullForm.json()).onTarget).toBe(true);

    // A missing introductory comma does not make an otherwise exact grammar
    // repair or rewrite wrong, and neither creates a Review card.
    const repair = await request.post('/api/week/grammar/mark', {
      data: { week: 1, id: 'W1-F2', answer: 'when i got home my flatmate had already cooked dinner' },
    });
    expect(repair.status()).toBe(200);
    expect((await repair.json()).correct).toBe(true);
    const rewrite = await request.post('/api/week/sentence', {
      data: { week: 1, id: 'W1-R2', answer: 'when we arrived the film had already started' },
    });
    expect(rewrite.status()).toBe(200);
    const rewriteBody = await rewrite.json();
    expect(rewriteBody.onTarget).toBe(true);
    expect(rewriteBody.checkedWith).toBe('target-form');
    expect(rewriteBody.addedToReview).toBe(false);
    const cards = await admin.from('error_review_cards').select('id').eq('user_id', user.id);
    if (cards.error) throw cards.error;
    expect(cards.data?.length).toBe(0);

    // Both attempts are stored where "Delete my data" reaches them.
    const stored = await admin
      .from('week_grammar_attempts')
      .select('item_id,correct')
      .eq('user_id', user.id)
      .eq('item_id', 'W1-R1');
    if (stored.error) throw stored.error;
    expect(stored.data?.length).toBe(2);
    expect(stored.data?.every((row) => row.correct === true)).toBe(true);

    // An answer that is not one of the authored ones goes to the model. Without
    // GROQ_API_KEY the route returns a safe error rather than marking it wrong;
    // when configured, the response has the three feedback parts.
    const other = await request.post('/api/week/sentence', {
      data: { week: 1, id: 'V1-S1', answer: 'I got used to working from home.' },
    });
    expect([200, 402, 429, 500, 503]).toContain(other.status());
    if (other.status() === 200) {
      const otherBody = await other.json();
      expect(typeof otherBody.corrected).toBe('string');
      expect(otherBody.corrected.length).toBeGreaterThan(0);
    }

    // A week that is not open yet is refused, so the boxes cannot be used to
    // practise ahead.
    const closed = await request.post('/api/week/sentence', {
      data: { week: 4, id: 'W4-R1', answer: 'The castle was built in 1190.' },
    });
    expect(closed.status()).toBe(403);

    // Unknown items are not a way to probe the bank.
    const unknown = await request.post('/api/week/sentence', {
      data: { week: 1, id: 'NOT-AN-ITEM', answer: 'Anything at all.' },
    });
    expect(unknown.status()).toBe(404);

    // "Delete my data" clears the attempts the boxes wrote. This has to go
    // through the app's endpoint, not admin.rpc: the function keys off
    // auth.uid(), so calling it with the service key raises and deletes
    // nothing -- which is exactly how a green-looking test hid this before.
    const deleted = await request.post('/api/account/delete-data', { data: { confirm: 'DELETE' } });
    expect(deleted.status()).toBe(200);
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

import { openWeekTask } from './helpers/week-tasks.mjs';
import { test, expect } from './helpers/isolated-test.mjs';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';

/**
 * Finishing grammar and vocabulary on /week/[n].
 *
 * Two claims are being tested, and they need different tools.
 *
 * 1. Signed out, the sections end in a Finish button rather than a disabled
 *    Next. That runs everywhere.
 * 2. Signed in, finish a full or partial practice, read the summary, reload,
 *    and find the answers and the summary still there. That needs a
 *    real learner whose rows the server can read back, so it needs the service
 *    key and is skipped without it.
 *
 * The answers are sent through the marking routes, as the page itself does. The
 * transcript-style shortcut is deliberate: waiting for twenty-two Check buttons
 * would make the spec about the browser's speed, and the finish route reads the
 * saved rows either way -- the same rows the buttons would have written.
 */
const url = process.env.E2E_SUPABASE_URL;
const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;

const vocabularyBank = JSON.parse(
  readFileSync(new URL('../../supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json', import.meta.url)),
);

/** Week 1's counted grammar questions: 22 of them, the number the brief quotes. */
const GRAMMAR_ANSWERS = [
  // See it: three meaning checks (See it is step 1 and holds no answer boxes).
  { id: 'W1-M1', answer: 'No' },
  { id: 'W1-M2', answer: 'waiting' },
  { id: 'W1-M3', answer: 'Yes' },
  // Practise: six choices. One is deliberately wrong, so the summary has a
  // mistake to report and a Review card to add.
  { id: 'W1-C1', answer: 'moved' },
  { id: 'W1-C2', answer: 'made' },
  { id: 'W1-C3', answer: 'left' },
  { id: 'W1-C4', answer: 'was cooking' },
  { id: 'W1-C5', answer: 'Have ... lived' },
  { id: 'W1-C6', answer: 'left' },
  // Practise: five completions.
  { id: 'W1-G1', answer: 'were driving' },
  { id: 'W1-G2', answer: 'had gone' },
  { id: 'W1-G3', answer: 'have known' },
  { id: 'W1-G4', answer: 'spent' },
  { id: 'W1-G5', answer: 'had not slept' },
  // Fix it: three repairs.
  { id: 'W1-F1', answer: 'I moved to Leeds in 2023.' },
  { id: 'W1-F2', answer: 'When I got home, my flatmate had already cooked dinner.' },
  { id: 'W1-F3', answer: 'I had known her for years before we worked together.' },
  // Remember: three light items and two earlier-week reviews.
  { id: 'W1-L1', answer: 'used to live' },
  { id: 'W1-L2', answer: 'would take' },
  { id: 'W1-L3', answer: "'ve been studying" },
  { id: 'W1-V1', answer: 'walk' },
  { id: 'W1-V2', answer: 'an' },
];

async function signIn(page, user) {
  await page.goto('/login');
  await page.getByLabel(/Email/i).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: /Sign in/i }).click();
  await page.waitForURL(/\/dashboard|\/labs/, { timeout: 60_000 });
}

/** Wait for the actual server save rather than assuming a fixed network delay. */
async function postFromUi(page, button, path, keyboard = false) {
  if (keyboard) await button.focus();
  const [response] = await Promise.all([
    page.waitForResponse((res) => new URL(res.url()).pathname === path
      && res.request().method() === 'POST', { timeout: 30_000 }),
    keyboard ? page.keyboard.press('Enter') : button.click(),
  ]);
  const body = await response.text();
  expect(response.ok(), `${path} returned ${response.status()}: ${body}`).toBe(true);
}

async function finishFromUi(page, button, keyboard = false) {
  await postFromUi(page, button, '/api/week/practice/finish', keyboard);
}

/** Answer every counted grammar question through the marking route. */
async function answerGrammar(page) {
  for (const { id, answer } of GRAMMAR_ANSWERS) {
    const response = await page.request.post('/api/week/grammar/mark', {
      data: { week: 1, id, answer },
    });
    expect(response.ok(), `marking ${id}`).toBe(true);
  }
}

/** Check the server mark and report only known, learner-safe errors in CI. */
async function markVocabulary(page, id, answer, correct) {
  const response = await page.request.post('/api/week/vocabulary/mark', {
    data: { week: 1, id, answer },
  });
  const result = await response.json().catch(() => null);
  const safeErrors = new Set([
    'Sign in to check your answer.', 'Please check your answer.',
    'This activity is not available.', 'Could not check your progress.',
    'This week is not open yet.', 'Could not save your answer.',
    'Could not save your answer. Please try again.',
    'Something went wrong. Please try again, or message your teacher.',
  ]);
  const detail = safeErrors.has(result?.error) ? result.error : 'other or non-JSON error (redacted)';
  expect(response.ok(), `marking ${id}: HTTP ${response.status()} (${detail})`).toBe(true);
  expect(result?.correct, `marking ${id}: unexpected correctness`).toBe(correct);
}

/** Answer every fixed vocabulary question, leaving step 7 (optional) alone. */
async function answerVocabulary(page) {
  const bank = vocabularyBank.weeks.find((entry) => entry.week === 1);
  const answers = [
    ...bank.match.items.map((item) => ({ id: item.id, answer: item.meaning })),
    ...bank.text.items.map((item) => ({ id: item.id, answer: item.key })),
    ...bank.chooseVerb.map((item) => ({ id: item.id, answer: item.options[item.answer_index] })),
    ...bank.wordForms.map((item) => ({ id: item.id, answer: item.options[item.answer_index] })),
    ...bank.typeTheWord.items.map((item) => ({ id: item.id, answer: item.key })),
  ];
  for (const { id, answer } of answers) await markVocabulary(page, id, answer, true);
}

test('signed out, the last grammar step offers Finish rather than a dead Next', async ({ page }) => {
  await page.goto('/week/1');
  const grammar = page.getByRole('region', { name: 'Grammar practice', exact: true });
  await expect(grammar.getByText(/Step \d of 5: /)).toBeVisible();

  for (let step = 1; step < 5; step += 1) {
    await grammar.getByRole('button', { name: 'Next step', exact: true }).click();
  }
  await expect(grammar.getByText('Step 5 of 5: Remember')).toBeVisible();

  // The old ending: Next, disabled, with nothing after it.
  await expect(grammar.getByRole('button', { name: 'Next step', exact: true })).toHaveCount(0);
  const finish = grammar.getByRole('button', { name: 'Finish grammar' });
  await expect(finish).toBeVisible();
  // Nothing can be saved signed out, so the button says so by staying disabled.
  await expect(finish).toBeDisabled();
  await expect(grammar.getByText(/Sign in to check and save/)).toBeVisible();
});

test('signed out, reading card meanings stay gated while vocabulary remains available', async ({ page }) => {
  await page.goto('/week/1#reading-practice');
  const reading = page.locator('#reading-practice');
  await reading.getByText('Go further (2–3 min)', { exact: true }).click();
  await expect(reading.getByText('Answer the reading questions first to open the card-word meanings and gloss check.')).toBeVisible();
  await expect(reading).not.toContainText('something new and difficult that needs effort');
  await expect(page.getByRole('region', { name: 'Vocabulary practice' })).toBeVisible();
});

test.describe('with a signed-in learner', () => {
  test.skip(!url || !key, 'Live test needs the service key');

  test('finish grammar automatically on the next visit, keep Finish, and reload the summary and answers', async ({ page }) => {
    test.setTimeout(240_000);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const user = await createTestUser(admin, 'week-finish');
    try {
      await signIn(page, user);
      await answerGrammar(page);

      const beforeFinish = await admin.from('week_skill_completions').select('skill')
        .eq('user_id', user.id).eq('week_number', 1).eq('skill', 'grammar');
      if (beforeFinish.error) throw beforeFinish.error;
      expect(beforeFinish.data).toEqual([], 'saving every required answer must not depend on the Finish summary action');
      await page.goto('/week/1');
      const grammar = page.getByRole('region', { name: 'Grammar practice', exact: true });
      await expect(grammar.getByRole('status').filter({ hasText: 'You answered' })).toHaveText(
        'You answered 22 of 22. 21 were right. Great work! You know this grammar well.',
      );
      const automatic = await admin.from('week_skill_completions').select('answered,correct,total,review_count')
        .eq('user_id', user.id).eq('week_number', 1).eq('skill', 'grammar').single();
      if (automatic.error) throw automatic.error;
      expect(automatic.data).toEqual({ answered: 22, correct: 21, total: 22, review_count: 1 });
      const automaticCards = await admin.from('error_review_cards').select('prompt_sentence').eq('user_id', user.id);
      if (automaticCards.error) throw automaticCards.error;
      expect(automaticCards.data?.length).toBe(1, 'opening the week creates the mistake card without Finish');

      // Every required question is answered, so the section can be finished.
      // Walk to the last step; the button is the end of the section, not a
      // disabled Next.
      for (let step = 1; step < 5; step += 1) {
        const next = grammar.getByRole('button', { name: 'Next step', exact: true });
        if (await next.isVisible()) await next.click();
      }
      const finish = grammar.getByRole('button', { name: 'Finish grammar' });
      await expect(finish).toBeEnabled();
      await expect(grammar.getByRole('status').filter({ hasText: 'You answered' })).toHaveText(
        'You answered 22 of 22. 21 were right. Great work! You know this grammar well.',
      );
      await finishFromUi(page, finish);

      // One short summary in B1 English, with the real counts: 21 of 22 right,
      // because W1-C2 was answered wrongly on purpose.
      const summary = grammar.getByRole('status').filter({ hasText: 'You answered' });
      await expect(summary).toBeVisible();
      await expect(summary).toHaveText(
        'You answered 22 of 22. 21 were right. Great work! You know this grammar well.',
      );
      // And the way on, not a dead end.
      await expect(grammar.getByRole('button', { name: 'Next: Vocabulary →' }).first()).toBeVisible();

      // The completion is a row, not a browser flag.
      const saved = await admin
        .from('week_skill_completions')
        .select('answered,correct,total,review_count')
        .eq('user_id', user.id)
        .eq('week_number', 1)
        .eq('skill', 'grammar')
        .single();
      if (saved.error) throw saved.error;
      expect(saved.data).toEqual({ answered: 22, correct: 21, total: 22, review_count: 1 });

      // The mistake really is in Review, deduplicated on a second finish.
      const cards = await admin
        .from('error_review_cards')
        .select('prompt_sentence')
        .eq('user_id', user.id);
      if (cards.error) throw cards.error;
      expect(cards.data?.length).toBe(1);

      // Reload: the answers and the summary are still there, from the server.
      await page.reload();
      const reloaded = page.getByRole('region', { name: 'Grammar practice', exact: true });
      await expect(
        reloaded.getByRole('status').filter({ hasText: 'You answered' }),
      ).toHaveText('You answered 22 of 22. 21 were right. Great work! You know this grammar well.');
      await expect(reloaded.getByRole('button', { name: 'Next: Vocabulary →' }).first()).toBeVisible();

      // The saved answers are on screen, not only in the summary. The page
      // opened at the last step because everything before it is answered.
      await expect(reloaded.getByText('Step 5 of 5: Remember')).toBeVisible();
      const back = reloaded.getByRole('button', { name: 'Previous step', exact: true });
      while (await back.isEnabled()) await back.click();
      await expect(reloaded.getByText('Step 1 of 5: See it')).toBeVisible();

      // Step 1: a saved choice is the one that is checked.
      await expect(reloaded.getByRole('radio', { name: 'No', exact: true }).first()).toBeChecked();
      await expect(reloaded.getByText(/Correct! /).first()).toBeVisible();

      // Step 2: another saved choice, and a typed completion in its box.
      await reloaded.getByRole('button', { name: 'Next step', exact: true }).click();
      await expect(reloaded.getByText('Step 2 of 5: Practise')).toBeVisible();
      await expect(reloaded.getByRole('radio', { name: 'moved', exact: true })).toBeChecked();
      await reloaded.getByRole('tab', { name: 'Go to item 7 of 11' }).click();
      await expect(reloaded.getByRole('textbox', { name: 'Your answer', exact: true })).toHaveValue('were driving');
      // The one answered wrongly is marked wrong on its own item.
      await reloaded.getByRole('tab', { name: 'Go to item 2 of 11' }).click();
      await expect(
        reloaded.getByText('I ___ a lot of new friends since then.'),
      ).toBeVisible();
      await expect(reloaded.getByRole('status').filter({ hasText: 'Not quite.' })).toBeVisible();

      // Step 3: the repair answers are back in their boxes.
      await reloaded.getByRole('button', { name: 'Next step', exact: true }).click();
      await expect(reloaded.getByText('Step 3 of 5: Fix it')).toBeVisible();
      await expect(reloaded.getByRole('textbox', { name: 'Your answer', exact: true })).toHaveValue('I moved to Leeds in 2023.');
      await expect(reloaded.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();

      // One completion row, not one per visit.
      const rows = await admin
        .from('week_skill_completions')
        .select('skill')
        .eq('user_id', user.id)
        .eq('week_number', 1);
      if (rows.error) throw rows.error;
      expect(rows.data?.length).toBe(1);
      await page.goto('/dashboard');
      await page.reload();
      await expect(page.getByText('1 of 6 tasks done')).toBeVisible();
      await expect(page.getByRole('link', { name: /Grammar.*22 items answered/ })).toContainText('✓');
    } finally {
      await deleteTestUser(admin, user.id);
    }
  });

  test('finish vocabulary with the writing step skipped, reload, and find the answers again', async ({ page }) => {
    test.setTimeout(240_000);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const user = await createTestUser(admin, 'week-vocab-finish');
    try {
      await signIn(page, user);
      // The previously flaky CI request was V1-F1. Exercise both its correct
      // and wrong choices repeatedly, and check the saved marks as well as the
      // HTTP responses before finishing the whole section.
      const form = vocabularyBank.weeks[0].wordForms.find((item) => item.id === 'V1-F1');
      const right = form.options[form.answer_index];
      const wrong = form.options.find((option) => option !== right);
      for (const [value, correct] of [[right, true], [wrong, false], [right, true], [right, true]]) {
        await markVocabulary(page, form.id, value, correct);
      }
      const attempts = await admin.from('week_vocabulary_attempts').select('answer,correct')
        .eq('user_id', user.id).eq('week_number', 1).eq('item_id', form.id);
      if (attempts.error) throw attempts.error;
      expect(attempts.data.filter((row) => row.answer === right && row.correct).length).toBe(3);
      expect(attempts.data.filter((row) => row.answer === wrong && !row.correct).length).toBe(1);

      await answerVocabulary(page);

      const beforeFinish = await admin.from('week_skill_completions').select('skill')
        .eq('user_id', user.id).eq('week_number', 1).eq('skill', 'vocabulary');
      if (beforeFinish.error) throw beforeFinish.error;
      expect(beforeFinish.data).toEqual([], 'saving every required answer must not depend on the Finish summary action');
      await page.goto('/dashboard');
      await expect(page.getByText('1 of 6 tasks done')).toBeVisible();
      await expect(page.getByRole('link', { name: /Vocabulary.*16 items answered/ })).toContainText('✓');
      const automatic = await admin.from('week_skill_completions').select('answered,correct,total')
        .eq('user_id', user.id).eq('week_number', 1).eq('skill', 'vocabulary').single();
      if (automatic.error) throw automatic.error;
      expect(automatic.data).toEqual({ answered: 16, correct: 16, total: 16 });

      // The page opens at step 7, because every required question is answered
      // and step 7 -- the optional writing step -- is the only gap left. That is
      // the whole point of restoring progress: the learner lands where they
      // stopped, with Finish on screen, rather than being walked from step 1.
      await page.goto('/week/1#vocabulary-practice');
      const vocabulary = page.getByRole('region', { name: 'Vocabulary practice', exact: true });
      await expect(vocabulary.getByText('Step 7 of 7: Your sentences')).toBeVisible();
      const finish = vocabulary.getByRole('button', { name: 'Finish vocabulary' });
      await expect(finish).toBeEnabled();
      await expect(vocabulary.getByRole('status').filter({ hasText: 'You answered' })).toHaveText(
        'You answered 16 of 16. 16 were right. Great work! You know these words well.',
      );
      await finishFromUi(page, finish);

      const summary = vocabulary.getByRole('status').filter({ hasText: 'You answered' });
      await expect(summary).toBeVisible();
      // All sixteen fixed questions were answered correctly, and nothing was
      // written in step 7, so there is nothing to review.
      await expect(summary).toHaveText('You answered 16 of 16. 16 were right. Great work! You know these words well.');
      await expect(vocabulary.getByRole('button', { name: 'Next: Reading →' }).first()).toBeVisible();

      const saved = await admin
        .from('week_skill_completions')
        .select('correct,total')
        .eq('user_id', user.id)
        .eq('week_number', 1)
        .eq('skill', 'vocabulary')
        .single();
      if (saved.error) throw saved.error;
      expect(saved.data).toEqual({ correct: 16, total: 16 });

      // A reload opens where they left off: the last step, still finished.
      await page.reload();
      const reloaded = page.getByRole('region', { name: 'Vocabulary practice', exact: true });
      await expect(reloaded.getByText('Step 7 of 7: Your sentences')).toBeVisible();
      await expect(reloaded.getByRole('status').filter({ hasText: 'You answered' })).toHaveText(
        'You answered 16 of 16. 16 were right. Great work! You know these words well.',
      );

      // Step 6 shows the saved typed words with their marks.
      await reloaded.getByRole('button', { name: 'Previous step', exact: true }).click();
      await expect(reloaded.getByText('Step 6 of 7: Type the word')).toBeVisible();
      // The typed word comes back with the mark it was given.
      await expect(reloaded.locator('input#V1-R1')).toHaveValue('take up');
      await expect(reloaded.getByRole('status').filter({ hasText: 'Correct! ' }).first()).toBeVisible();
      await page.goto('/dashboard');
      await page.reload();
      await expect(page.getByText('1 of 6 tasks done')).toBeVisible();
      await expect(page.getByRole('link', { name: /Vocabulary.*16 items answered/ })).toContainText('✓');
    } finally {
      await deleteTestUser(admin, user.id);
    }
  });

  test('phone: partial grammar and vocabulary finish, Review and reload agree', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      window.practiceScrolls = [];
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (options) {
        if (this.id === 'grammar-practice' || this.id === 'vocabulary-practice' || this.id === 'reading-practice') {
          window.practiceScrolls.push({ id: this.id, behavior: options?.behavior });
        }
        return original.call(this, options);
      };
    });
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const user = await createTestUser(admin, 'week-partial-phone');
    try {
      await signIn(page, user);
      const grammarAnswers = [
        ['W1-M1', 'No', true], ['W1-M2', 'waiting', true], ['W1-M3', 'Yes', true],
        ['W1-C1', 'have moved', false], ['W1-C2', 'have made', true], ['W1-C3', 'had left', true],
        ['W1-C5', 'Did ... live', true],
      ];
      for (const [id, answer, correct] of grammarAnswers) {
        const response = await page.request.post('/api/week/grammar/mark', { data: { week: 1, id, answer } });
        expect(response.ok(), id).toBe(true);
        expect((await response.json()).correct, id).toBe(correct);
      }
      const bank = vocabularyBank.weeks.find((entry) => entry.week === 1);
      const vocabularyAnswers = [
        [bank.match.items[0].id, bank.match.items[0].meaning, true],
        [bank.match.items[1].id, bank.match.items[1].meaning, true],
        [bank.chooseVerb[0].id, bank.chooseVerb[0].options[0], false],
      ];
      for (const [id, answer, correct] of vocabularyAnswers) {
        const response = await page.request.post('/api/week/vocabulary/mark', { data: { week: 1, id, answer } });
        expect(response.ok(), id).toBe(true);
        expect((await response.json()).correct, id).toBe(correct);
      }

      await page.goto('/week/1');
      const grammar = page.getByRole('region', { name: 'Grammar practice', exact: true });
      await expect(grammar.getByRole('heading', { name: 'Step 2 of 5: Practise' })).toBeVisible();
      for (let step = 2; step < 5; step += 1) {
        const next = grammar.getByRole('button', { name: 'Next step', exact: true });
        await next.focus();
        await page.keyboard.press('Enter');
        await expect(grammar.getByRole('heading', { name: new RegExp(`Step ${step + 1} of 5:`) })).toBeFocused();
      }
      const finishGrammar = grammar.getByRole('button', { name: 'Finish grammar' });
      await expect(finishGrammar).toBeEnabled();
      await finishFromUi(page, finishGrammar, true);
      const grammarSummary = 'You answered 7 of 22. 6 were right. Great work! You know this grammar well. You can come back and finish the other questions.';
      await expect(grammar.getByRole('status').filter({ hasText: 'You answered' })).toHaveText(grammarSummary);
      await expect(grammar.getByRole('heading', { name: 'Step 5 of 5: Remember' })).toBeFocused();
      await expect.poll(async () => Math.abs((await grammar.boundingBox()).y)).toBeLessThan(40);
      expect((await page.evaluate(() => window.practiceScrolls)).filter((call) => call.id === 'grammar-practice').at(-1)?.behavior).toBe('instant');
      const cards = await admin.from('error_review_cards').select('category, corrected_sentence').eq('user_id', user.id);
      if (cards.error) throw cards.error;
      expect(cards.data).toEqual([{ category: 'tense', corrected_sentence: 'I moved to Bristol three years ago.' }]);

      // The same Finish action scrolls smoothly when motion is not reduced.
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const beforeRepeat = await page.evaluate(() => window.practiceScrolls.length);
      await finishFromUi(page, finishGrammar, true);
      await expect.poll(() => page.evaluate(() => window.practiceScrolls.length)).toBeGreaterThan(beforeRepeat);
      expect((await page.evaluate(() => window.practiceScrolls)).at(-1)?.behavior).toBe('smooth');
      await expect(grammar.getByRole('heading', { name: 'Step 5 of 5: Remember' })).toBeFocused();
      await page.emulateMedia({ reducedMotion: 'reduce' });

      // Reload keeps the last visited step and the exact snapshot. The other
      // 15 questions were not turned into Review cards.
      await page.reload();
      await expect(grammar.getByRole('heading', { name: 'Step 5 of 5: Remember' })).toBeVisible();
      await expect(grammar.getByRole('status').filter({ hasText: 'You answered' })).toHaveText(grammarSummary);
      await expect(grammar.getByText('After checking more answers, press Finish again to update your score.')).toBeVisible();
      for (let step = 5; step > 2; step -= 1) {
        await grammar.getByRole('button', { name: 'Previous step', exact: true }).click();
      }
      await expect(grammar.getByRole('heading', { name: 'Step 2 of 5: Practise' })).toBeVisible();

      // Check one more answer in the UI, then leave and return to that step.
      // The newly saved choice and its feedback survive navigation; the last
      // finished snapshot stays unchanged until the learner finishes again.
      const more = grammar.locator('div.rounded-xl.bg-stone-50').filter({ hasText: 'I ___ dinner when my phone rang.' });
      await more.getByRole('radio', { name: 'was cooking', exact: true }).check();
      await postFromUi(page, more.getByRole('button', { name: 'Check', exact: true }), '/api/week/grammar/mark');
      await expect(more.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
      await expect(grammar.getByText('Your latest answers may not match this score. Press Finish again to update it.')).toBeVisible();
      await grammar.getByRole('button', { name: 'Next step', exact: true }).click();
      await grammar.getByRole('button', { name: 'Previous step', exact: true }).click();
      await expect(more.getByRole('radio', { name: 'was cooking', exact: true })).toBeChecked();
      await expect(more.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
      await expect(grammar.getByRole('status').filter({ hasText: 'You answered' })).toHaveText(grammarSummary);

      await openWeekTask(page, 'vocabulary-practice');
      const vocabulary = page.getByRole('region', { name: 'Vocabulary practice', exact: true });
      await expect(vocabulary.getByRole('heading', { name: 'Step 2 of 7: Match' })).toBeVisible();
      for (let step = 2; step < 7; step += 1) {
        const next = vocabulary.getByRole('button', { name: 'Next step', exact: true });
        await next.focus();
        await page.keyboard.press('Enter');
        await expect(vocabulary.getByRole('heading', { name: new RegExp(`Step ${step + 1} of 7:`) })).toBeFocused();
      }
      const finishVocabulary = vocabulary.getByRole('button', { name: 'Finish vocabulary' });
      await expect(finishVocabulary).toBeEnabled();
      await finishFromUi(page, finishVocabulary, true);
      const vocabularySummary = 'You answered 3 of 16. 2 were right. Good effort! Your mistakes are in Review, so you can practise them. You can come back and finish the other questions.';
      await expect(vocabulary.getByRole('status').filter({ hasText: 'You answered' })).toHaveText(vocabularySummary);
      await expect(vocabulary.getByRole('heading', { name: 'Step 7 of 7: Your sentences' })).toBeFocused();
      await expect.poll(async () => Math.abs((await vocabulary.boundingBox()).y)).toBeLessThan(40);
      expect((await page.evaluate(() => window.practiceScrolls)).filter((call) => call.id === 'vocabulary-practice').at(-1)?.behavior).toBe('instant');
      const cardsAfter = await admin.from('error_review_cards').select('category, corrected_sentence').eq('user_id', user.id);
      if (cardsAfter.error) throw cardsAfter.error;
      expect(cardsAfter.data).toEqual(expect.arrayContaining([
        { category: 'collocation', corrected_sentence: 'I took a risk and applied for a job abroad.' },
      ]));
      expect(cardsAfter.data.length).toBe(2);
      const completion = await admin.from('week_skill_completions').select('skill,answered,correct,total,review_count').eq('user_id', user.id);
      if (completion.error) throw completion.error;
      expect(completion.data).toEqual(expect.arrayContaining([
        { skill: 'grammar', answered: 7, correct: 6, total: 22, review_count: 1 },
        { skill: 'vocabulary', answered: 3, correct: 2, total: 16, review_count: 1 },
      ]));

      await page.reload();
      await expect(vocabulary.getByRole('status').filter({ hasText: 'You answered' })).toHaveText(vocabularySummary);
      await openWeekTask(page, 'grammar-practice');
      await expect(grammar.getByRole('status').filter({ hasText: 'You answered' })).toHaveText(grammarSummary);
      await expect(grammar.getByText('Your latest answers may not match this score. Press Finish again to update it.')).toBeVisible();
      await openWeekTask(page, 'vocabulary-practice');
      await vocabulary.getByRole('button', { name: 'Next: Reading →' }).first().click();
      await expect(page.locator('#reading-practice h2')).toBeFocused();
      const calls = await page.evaluate(() => window.practiceScrolls);
      expect(calls.filter((call) => call.id === 'reading-practice').at(-1)?.behavior).toBe('instant');

      // Choice mistakes reach Review with clear options and full corrected sentences.
      await page.goto('/review');
      await expect(page.getByText('Choose the missing word(s):')).toBeVisible();
      await expect(page.getByText(/I ___ to Bristol three years ago\./)).toBeVisible();
      await page.getByRole('button', { name: 'moved', exact: true }).click();
      await postFromUi(page, page.getByRole('button', { name: 'Check my answer' }), '/api/review/check-rewrite');
      await expect(page.getByText(/Well done! You fixed it without help\./)).toBeVisible();
    } finally {
      await deleteTestUser(admin, user.id);
    }
  });

  test('"Delete my data" clears the completion records', async ({ page }) => {
    test.setTimeout(180_000);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const user = await createTestUser(admin, 'week-finish-delete');
    try {
      await signIn(page, user);
      await answerGrammar(page);
      const finished = await page.request.post('/api/week/practice/finish', {
        data: { week: 1, skill: 'grammar' },
      });
      expect(finished.status()).toBe(200);

      const before = await admin
        .from('week_skill_completions')
        .select('skill')
        .eq('user_id', user.id);
      if (before.error) throw before.error;
      expect(before.data?.length).toBe(1);

      const deleted = await page.request.post('/api/account/delete-data', { data: { confirm: 'DELETE' } });
      expect(deleted.status()).toBe(200);

      const after = await admin
        .from('week_skill_completions')
        .select('skill')
        .eq('user_id', user.id);
      if (after.error) throw after.error;
      expect(after.data?.length).toBe(0);
    } finally {
      await deleteTestUser(admin, user.id);
    }
  });

  test('the finish route refuses an unfinished section and never trusts a count', async ({ page }) => {
    test.setTimeout(150_000);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const user = await createTestUser(admin, 'week-finish-guard');
    try {
      await signIn(page, user);

      // Nothing answered yet: no completion, and no invented score.
      const early = await page.request.post('/api/week/practice/finish', {
        data: { week: 1, skill: 'grammar', correct: 22, total: 22 },
      });
      expect(early.status()).toBe(400);
      const body = await early.json();
      expect(body.remaining).toBe(22);

      const none = await admin
        .from('week_skill_completions')
        .select('skill')
        .eq('user_id', user.id);
      if (none.error) throw none.error;
      expect(none.data?.length).toBe(0);
    } finally {
      await deleteTestUser(admin, user.id);
    }
  });
});

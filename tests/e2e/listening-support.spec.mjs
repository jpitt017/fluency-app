import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';

const details = JSON.parse(
  readFileSync(new URL('../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json', import.meta.url), 'utf8'),
);
const week1Listening = details.listening.weeks.find((week) => week.week === 1);

/**
 * Listening support on /week/[n]: the transcript gate, the glosses, and the
 * gloss check.
 *
 * Signed-out coverage runs everywhere. The signed-in test needs the service key
 * because it has to create a learner, answer questions as them, and read the
 * rows "Delete my data" is supposed to clear.
 *
 * The gate is the interesting one: the transcript must not be in the page until
 * every listening question has a saved answer, checked on the server. A test
 * that only looked for CSS hiding would pass on a page that shipped the script.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** The week's real listening question ids, straight from the item bank. */
const listeningIds = week1Listening.questions.map((question) => question.id);

test('the intro replaces the old predict line and shows the key words', async ({ page }) => {
  await page.goto('/week/1');

  // The new intro: title, context, prediction, ideas and two key words.
  await expect(page.getByRole('heading', { name: 'Fresh Starts, a podcast about big changes' })).toBeVisible();
  await expect(page.getByText('Ellie lived in London.', { exact: false })).toBeVisible();
  await expect(page.getByText('What could be difficult about moving from a big city to a small village?')).toBeVisible();
  const listening = page.locator('#listening-practice');
  await expect(listening.getByRole('heading', { name: 'Two words to know' })).toBeVisible();
  await expect(listening.getByTestId('listening-picture-placeholder')).toBeVisible();

  // Ideas are not rendered at all until asked for, which also keeps them out of
  // the initial payload rather than merely hiding them.
  await expect(page.getByText('no shops nearby')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show some ideas' }).click();
  await expect(page.getByText('no shops nearby')).toBeVisible();

  // A key word meaning is in the markup but closed: the reveal is the `hidden`
  // attribute, so the assertion is on visibility, not on presence.
  await expect(page.getByText('when there is no sound at all')).not.toBeVisible();
  await page.getByRole('button', { name: 'silence', exact: true }).click();
  await expect(page.getByText('when there is no sound at all')).toBeVisible();
  await expect(page.getByText('el silencio')).toBeVisible();

  // Tapping the same word again closes it.
  await page.getByRole('button', { name: 'silence', exact: true }).click();
  await expect(page.getByText('when there is no sound at all')).not.toBeVisible();

  // The old copy is gone.
  const html = await page.content();
  expect(html).not.toContain('The transcript stays hidden for now');
});

test('the transcript is not in the page before the listening questions are answered', async ({ page }) => {
  const response = await page.goto('/week/1');
  const html = await response.text();

  // Not hidden with CSS: absent from the served markup.
  expect(html).not.toContain('Welcome back to Fresh Starts');
  expect(html).not.toContain('grandmother had left me a small house near Inverness');
  // Nor are the glosses or the gloss-check questions, which practice the text.
  expect(html).not.toContain('Realised means');
  expect(html).not.toContain('me di cuenta');

  await expect(page.getByText('Answer the listening questions first', { exact: false })).toBeVisible();
  // A <details> summary is a button in the accessibility tree, not a heading.
  await expect(page.getByText('Go further (3–4 min)', { exact: true })).toBeAttached();
});

test('no answer key reaches the browser, in markup or in page data', async ({ page }) => {
  await page.goto('/week/1');

  // The page's own scripts and flight data, not just the visible HTML.
  const payloads = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script'))
      .map((script) => script.textContent ?? '')
      .join('\n');
    return { scripts, html: document.documentElement.outerHTML };
  });

  for (const [label, payload] of Object.entries(payloads)) {
    expect(payload, `${label} must not carry an answer index`).not.toContain('answerIndex');
    expect(payload, `${label} must not carry a snake-case answer index`).not.toContain('answer_index');
    // The gloss-check feedback names the right answer outright.
    expect(payload, `${label} must not carry gloss feedback`).not.toContain('Realise = darse cuenta');
  }
});

/**
 * A helper for the signed-in tests: answer all of week 1's listening questions
 * through the marking route, which is what opens the transcript.
 */
async function answerListeningQuestions(page) {
  for (const question of week1Listening.questions) {
    // L1-X3 has no options: it is a short typed answer, and the route rejects a
    // choice that is not offered. The first option is right for the multiple
    // choice items, which is all this needs -- the gate counts saved answers,
    // not correct ones.
    const answer = question.options.length ? question.options[0] : 'get used to';
    const response = await page.request.post('/api/week/input/mark', {
      data: { week: 1, skill: 'listening', id: question.id, answer },
    });
    expect(response.ok(), `marking ${question.id}`).toBe(true);
  }
}

/** "Go further" is a <details>; its contents are unreachable until it is open. */
async function openGoFurther(page) {
  const listening = page.locator('#listening-practice');
  const summary = listening.getByText('Go further (3–4 min)', { exact: true });
  await expect(summary).toBeVisible();
  const details = listening.locator('details');
  if (!(await details.getAttribute('open'))) await summary.click();
  await expect(listening.getByRole('heading', { name: 'Check four words' })).toBeVisible();
}

async function signIn(page, user) {
  await page.goto('/login');
  await page.getByLabel(/Email/i).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: /Sign in/i }).click();
  await page.waitForURL(/\/dashboard|\/labs/, { timeout: 60_000 });
}

test.describe('gloss interaction, with a signed-in learner', () => {
  test.skip(!url || !key, 'Live test needs the service key');

  test('a transcript gloss opens and closes with the mouse', async ({ page }) => {
    test.setTimeout(180_000);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const user = await createTestUser(admin, 'gloss-mouse');
    try {
      await signIn(page, user);
      await answerListeningQuestions(page);
      await page.goto('/week/1');
      await openGoFurther(page);

      // The gloss inside the transcript, not a key-word card.
      const gloss = page.locator('#listening-practice details').getByRole('button', { name: 'realised', exact: true }).first();
      await expect(gloss).toBeVisible();
      await expect(gloss).toHaveAttribute('aria-expanded', 'false');

      await gloss.click();
      await expect(gloss).toHaveAttribute('aria-expanded', 'true');
      // The B1 meaning and the Spanish below it.
      await expect(page.getByRole('dialog', { name: 'Meaning of realised' })).toBeVisible();
      await expect(page.getByText('suddenly understood or noticed something')).toBeVisible();
      await expect(page.getByText('me di cuenta')).toBeVisible();

      await gloss.click();
      await expect(gloss).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByRole('dialog', { name: 'Meaning of realised' })).toHaveCount(0);
    } finally {
      await deleteTestUser(admin, user.id);
    }
  });

  test('a transcript gloss opens and closes with the keyboard and Escape', async ({ page }) => {
    test.setTimeout(180_000);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const user = await createTestUser(admin, 'gloss-keyboard');
    try {
      await signIn(page, user);
      await answerListeningQuestions(page);
      await page.goto('/week/1');
      await openGoFurther(page);

      const gloss = page.locator('#listening-practice details').getByRole('button', { name: 'realised', exact: true }).first();
      await gloss.focus();
      await expect(gloss).toHaveAttribute('aria-expanded', 'false');

      // Enter opens it, and the popup is announced by its accessible name.
      await page.keyboard.press('Enter');
      await expect(gloss).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('dialog', { name: 'Meaning of realised' })).toBeVisible();

      // Escape closes it and puts focus back on the word, so a screen-reader
      // user is not dropped at the top of the page.
      await page.keyboard.press('Escape');
      await expect(gloss).toHaveAttribute('aria-expanded', 'false');
      await expect(gloss).toBeFocused();

      // Space opens it too: it is a real button, not a span with a handler.
      await page.keyboard.press('Space');
      await expect(gloss).toHaveAttribute('aria-expanded', 'true');

      // A card word opens too, and its popup carries no Spanish (it is a
      // reminder of the vocabulary step, not a gloss).
      const cardWord = page.locator('#listening-practice details').getByRole('button', { name: 'challenge', exact: true }).first();
      await cardWord.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: 'Meaning of challenge' })).toBeVisible();
    } finally {
      await deleteTestUser(admin, user.id);
    }
  });
});

test.describe('with a signed-in learner', () => {
  test.skip(!url || !key, 'Live test needs the service key');

  test('answering the questions opens the transcript, and deletion clears the gloss attempts', async ({ page }) => {
    test.setTimeout(180_000);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const user = await createTestUser(admin, 'listening-e2e');
    try {
      await signIn(page, user);

      // Still closed for this learner, who has answered nothing.
      await page.goto('/week/1');
      await expect(page.getByText('Answer the listening questions first', { exact: false })).toBeVisible();
      expect(await page.content()).not.toContain('Welcome back to Fresh Starts');

      // Answer every listening question the way the UI does, then confirm the
      // server has them.
      const script = week1Listening.script;
      for (const question of week1Listening.questions) {
        const response = await page.request.post('/api/week/input/mark', {
          data: { week: 1, skill: 'listening', id: question.id, answer: question.options[0] ?? question.key },
        });
        expect(response.ok(), `marking ${question.id}`).toBe(true);
      }
      const saved = await admin
        .from('week_input_answers')
        .select('item_id')
        .eq('user_id', user.id)
        .eq('week_number', 1)
        .eq('skill', 'listening');
      if (saved.error) throw saved.error;
      expect(saved.data?.length).toBe(listeningIds.length);

      // Now the transcript is served, and it is the real script.
      const unlocked = await page.goto('/week/1');
      const html = await unlocked.text();
      expect(html).toContain('Welcome back to Fresh Starts');

      // The gloss check is marked on the server, and a gloss attempt is stored.
      const gloss = await page.request.post('/api/week/listening/gloss', {
        data: { week: 1, itemId: 'gloss-1-1', answer: 'suddenly understood' },
      });
      expect(gloss.status()).toBe(200);
      const marked = await gloss.json();
      expect(marked.correct).toBe(true);
      expect(marked.feedback.length).toBeGreaterThan(0);

      const attempts = await admin
        .from('week_input_answers')
        .select('item_id,correct')
        .eq('user_id', user.id)
        .eq('item_id', 'gloss-1-1');
      if (attempts.error) throw attempts.error;
      expect(attempts.data?.length).toBe(1);

      // The gloss check must not unlock the next week: it writes no submission.
      const submissions = await admin
        .from('week_input_submissions')
        .select('skill')
        .eq('user_id', user.id)
        .eq('week_number', 1);
      if (submissions.error) throw submissions.error;
      expect(submissions.data?.length ?? 0).toBe(0);

      // "Delete my data" clears the gloss rows with the rest.
      const deleted = await page.request.post('/api/account/delete-data', { data: { confirm: 'DELETE' } });
      expect(deleted.status()).toBe(200);
      const left = await admin.from('week_input_answers').select('id').eq('user_id', user.id);
      if (left.error) throw left.error;
      expect(left.data?.length).toBe(0);

      // Sanity: the script text really is the week's listening script.
      expect(script).toContain('Welcome back to Fresh Starts');
    } finally {
      await deleteTestUser(admin, user.id);
    }
  });
});

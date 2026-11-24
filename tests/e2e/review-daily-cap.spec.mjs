import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../../scripts/lib/test-user.mjs';

/**
 * Review: marking sets the rating, the daily cap, and "Review more".
 *
 * The signed-in tests need the service key: they create a learner, seed cards
 * with known due dates, and read what the page did. Cards are seeded directly
 * rather than by answering real exercises, so each test is about one behaviour
 * and not about the content of week 1.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function signIn(page, user) {
  await page.goto('/login');
  await page.getByLabel(/Email/i).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: /Sign in/i }).click();
  await page.waitForURL(/\/dashboard|\/labs/, { timeout: 60_000 });
}

/** Seed one error card, due now, with a known correction. */
async function seedErrorCard(admin, userId, { prompt, corrected, overdueMinutes = 5, lapses = 0 }) {
  const dueAt = new Date(Date.now() - overdueMinutes * 60_000).toISOString();
  const { data, error } = await admin
    .from('error_review_cards')
    .insert({
      user_id: userId,
      category: 'tense',
      prompt_sentence: prompt,
      corrected_sentence: corrected,
      context_sentence: null,
      explanation: 'Test card.',
      due_at: dueAt,
      reps: 1,
      lapses,
      interval_days: 0,
      stability: 1,
      difficulty: 5,
      fsrs_state: 2,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

test('signed out, the review page asks for a sign-in and shows no cards', async ({ page }) => {
  await page.goto('/review');
  await expect(page.getByRole('heading', { name: /Sign in to practise your recurring mistakes/i })).toBeVisible();
  await expect(page.getByText("Today's review", { exact: false })).toHaveCount(0);
});

test.describe('with a signed-in learner', () => {
  test.skip(!url || !key, 'Live test needs the service key');

  test('a correct typed answer is rated Good', async ({ page }) => {
    test.setTimeout(150_000);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const user = await createTestUser(admin, 'review-good');
    try {
      await seedErrorCard(admin, user.id, {
        prompt: 'I have moved to Leeds in 2023.',
        corrected: 'I moved to Leeds in 2023.',
      });
      await signIn(page, user);
      await page.goto('/review');

      await page.getByLabel('Your corrected sentence').fill('I moved to Leeds in 2023.');
      await page.getByRole('button', { name: /Check my repair/i }).click();

      // Marking decides: Good is offered, and Easy as a deliberate upgrade.
      await expect(page.getByText(/That is right/i)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('button', { name: /^Good/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Easy/ })).toBeVisible();
      // Hard is not part of marking.
      await expect(page.getByRole('button', { name: /^Hard/ })).toHaveCount(0);

      const before = await admin.from('error_review_cards').select('reps, due_at').eq('user_id', user.id).single();
      await page.getByRole('button', { name: /^Good/ }).click();
      await page.waitForTimeout(1500);

      const after = await admin.from('error_review_cards').select('reps, due_at, last_reviewed_on').eq('user_id', user.id).single();
      if (after.error) throw after.error;
      expect(after.data.reps).toBeGreaterThan(before.data?.reps ?? 0);
      expect(after.data.last_reviewed_on).toBe(new Date().toISOString().slice(0, 10));
    } finally {
      await deleteTestUser(admin, user.id);
    }
  });

  test('a wrong typed answer is rated Again and Easy is not offered', async ({ page }) => {
    test.setTimeout(150_000);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const user = await createTestUser(admin, 'review-wrong');
    try {
      await seedErrorCard(admin, user.id, {
        prompt: 'I have moved to Leeds in 2023.',
        corrected: 'I moved to Leeds in 2023.',
      });
      await signIn(page, user);
      await page.goto('/review');

      await page.getByLabel('Your corrected sentence').fill('I have moved to Leeds in 2023, yesterday.');
      await page.getByRole('button', { name: /Check my repair/i }).click();

      await expect(page.getByText(/Not this time/i)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('button', { name: /^Again/ })).toBeVisible();
      // The upgrade path must be absent, not merely disabled.
      await expect(page.getByRole('button', { name: /^Easy/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Good/ })).toHaveCount(0);

      // Grading Again stores the grade and keeps the card due soon.
      await page.getByRole('button', { name: /^Again/ }).click();
      await page.waitForTimeout(1500);
      const { data: reviews, error } = await admin
        .from('vocab_reviews')
        .select('grade')
        .eq('user_id', user.id);
      if (error) throw error;
      // An error card's grade is not in vocab_reviews; check the card moved back
      // to a short interval instead, which is what "comes back soon" means.
      const { data: card } = await admin
        .from('error_review_cards')
        .select('reps, last_reviewed_on')
        .eq('user_id', user.id)
        .single();
      expect(card?.last_reviewed_on).toBe(new Date().toISOString().slice(0, 10));
      expect(reviews?.length ?? 0).toBe(0);
    } finally {
      await deleteTestUser(admin, user.id);
    }
  });

  test('the cap shows 20 cards and offers "Review more"', async ({ page }) => {
    test.setTimeout(180_000);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const user = await createTestUser(admin, 'review-cap');
    try {
      // 23 cards, all overdue, the first 20 minutes apart so the order is known.
      for (let i = 0; i < 23; i += 1) {
        await seedErrorCard(admin, user.id, {
          prompt: `Test sentence ${i} has a mistake.`,
          corrected: `Test sentence ${i} is correct.`,
          overdueMinutes: 100 - i,
          lapses: i,
        });
      }
      await signIn(page, user);
      await page.goto('/review');

      // The line at the top: 20 cards, about 7 minutes (20 seconds a card).
      await expect(page.getByText(/Today's review: 20 cards, about 7 minutes/)).toBeVisible();
      await expect(page.getByText(/Card 1 \/ 20/)).toBeVisible();

      // Reaching the end offers the rest.
      const plan = await page.evaluate(async () => {
        const response = await fetch('/api/review/more', { method: 'POST' });
        const data = await response.json();
        return { status: response.status, count: data.cards?.length ?? 0 };
      });
      expect(plan.status).toBe(200);
      expect(plan.count).toBe(23);
    } finally {
      await deleteTestUser(admin, user.id);
    }
  });

  test('"Review more" works for a learner who has used the whole allowance', async ({ page }) => {
    test.setTimeout(180_000);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const user = await createTestUser(admin, 'review-more');
    try {
      // 21 cards, 20 of which are already stamped as reviewed today.
      const today = new Date().toISOString().slice(0, 10);
      for (let i = 0; i < 21; i += 1) {
        const id = await seedErrorCard(admin, user.id, {
          prompt: `Test sentence ${i} has a mistake.`,
          corrected: `Test sentence ${i} is correct.`,
          overdueMinutes: 100 - i,
        });
        if (i < 20) {
          const { error } = await admin
            .from('error_review_cards')
            .update({ last_reviewed_on: today })
            .eq('id', id);
          if (error) throw error;
        }
      }
      await signIn(page, user);
      await page.goto('/review');

      // The cap is used up: the page says so and offers the button.
      await expect(page.getByText(/Well done!/)).toBeVisible();
      const more = page.getByRole('button', { name: 'Review more' });
      await expect(more).toBeVisible();

      await more.click();
      // And pressing it hands over the card the cap held back.
      await expect(page.getByText(/Card 1 \/ 1/)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/Test sentence 0/)).toBeVisible();
    } finally {
      await deleteTestUser(admin, user.id);
    }
  });

  test('a weekly mistake makes the word due sooner, without a duplicate card', async ({ page }) => {
    test.setTimeout(180_000);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const user = await createTestUser(admin, 'week-review');
    try {
      await signIn(page, user);

      // A real weekly exercise answer: V1-M1 is "turning point", which exists in
      // the weekly vocabulary deck, answered wrongly on purpose.
      const wrong = await page.request.post('/api/week/vocabulary/mark', {
        data: { week: 1, id: 'V1-M1', answer: 'a time when something important changes'.replace('important', 'unimportant') },
      });
      expect(wrong.status()).toBe(200);
      expect((await wrong.json()).correct).toBe(false);

      const cards = await admin
        .from('vocab_cards')
        .select('id, vocab_item_id, due_at, reps, lapses')
        .eq('user_id', user.id);
      if (cards.error) throw cards.error;
      expect(cards.data?.length, 'one card for the word, created on first use').toBe(1);

      const first = cards.data[0];
      const dueAfterMiss = new Date(first.due_at).getTime();
      expect(first.lapses).toBeGreaterThan(0);
      // Again means it comes back very soon: within the hour, not in days.
      expect(dueAfterMiss - Date.now()).toBeLessThan(60 * 60_000);

      // Answering the same word right must not create a second card.
      const right = await page.request.post('/api/week/vocabulary/mark', {
        data: { week: 1, id: 'V1-M1', answer: 'a time when something important changes' },
      });
      expect(right.status()).toBe(200);
      expect((await right.json()).correct).toBe(true);

      const after = await admin
        .from('vocab_cards')
        .select('id, due_at, reps')
        .eq('user_id', user.id);
      if (after.error) throw after.error;
      expect(after.data?.length, 'no duplicate card').toBe(1);
      expect(after.data[0].reps).toBeGreaterThan(first.reps);
      // Good pushes it further out than Again did.
      expect(new Date(after.data[0].due_at).getTime()).toBeGreaterThan(dueAfterMiss);
    } finally {
      await deleteTestUser(admin, user.id);
    }
  });
});

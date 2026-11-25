import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { scheduleFsrsReview } from './fsrs';

/**
 * Feed a weekly vocabulary answer into Review.
 *
 * A wrong answer is graded Again, so the word comes back in the next session; a
 * right answer is graded Good, which moves it on. The card is created if this is
 * the first time the learner has met the word, and never duplicated: the unique
 * constraint on (user_id, vocab_item_id, card_kind) plus `ignoreDuplicates` makes
 * a second pass a no-op.
 *
 * Failure here must not fail the learner's answer. The attempt is already saved
 * and the feedback is already right; the review card is a follow-on, so every
 * problem is logged and swallowed. Finish may use `ensureOnly` to ensure a
 * missing card without grading the same checked answer a second time.
 */
export async function updateReviewFromWeeklyPractice(
  admin: SupabaseClient,
  userId: string,
  term: string,
  correct: boolean,
  now = new Date(),
  options: { ensureOnly?: boolean } = {},
): Promise<{ updated: boolean; dueAt: string | null }> {
  const wanted = term.trim().toLocaleLowerCase('en-GB');
  if (!wanted) return { updated: false, dueAt: null };

  try {
    // The weekly decks first. `weeks-01-04` is built from the published weekly
    // vocabulary; the module decks are tried as well so a word that exists in
    // both updates the card the learner already has.
    const { data: decks } = await admin
      .from('vocab_decks')
      .select('id, slug')
      .in('slug', ['weeks-01-04', 'module-1', 'module-2', 'module-3', 'module-4'])
      .order('slug', { ascending: false });
    const deckIds = (decks ?? []).map((deck) => deck.id as string);
    if (!deckIds.length) return { updated: false, dueAt: null };

    const { data: items, error: itemError } = await admin
      .from('vocab_items')
      .select('id, term, deck_id')
      .in('deck_id', deckIds)
      .ilike('term', wanted);
    if (itemError || !items?.length) return { updated: false, dueAt: null };

    // SQL IN does not preserve the order of deckIds. Prefer an active card the
    // learner already owns, then any existing card, then the weekly deck. This
    // avoids creating a second card for the same exact authored term merely
    // because the database returned another deck first.
    const candidates = items
      .filter((entry) => String(entry.term).trim().toLocaleLowerCase('en-GB') === wanted)
      .sort((a, b) => deckIds.indexOf(a.deck_id) - deckIds.indexOf(b.deck_id) || String(a.id).localeCompare(String(b.id)));
    if (!candidates.length) return { updated: false, dueAt: null };
    const { data: existing, error: existingError } = await admin
      .from('vocab_cards')
      .select('vocab_item_id, suspended')
      .eq('user_id', userId)
      .eq('card_kind', 'definition')
      .in('vocab_item_id', candidates.map((entry) => entry.id));
    if (existingError) return { updated: false, dueAt: null };
    const activeIds = new Set((existing ?? []).filter((card) => !card.suspended).map((card) => card.vocab_item_id));
    const existingIds = new Set((existing ?? []).map((card) => card.vocab_item_id));
    const item = candidates.find((entry) => activeIds.has(entry.id))
      ?? candidates.find((entry) => existingIds.has(entry.id))
      ?? candidates[0];

    // No duplicate cards: the row is inserted only if it is not already there.
    const { error: cardError } = await admin
      .from('vocab_cards')
      .upsert(
        { user_id: userId, vocab_item_id: item.id, card_kind: 'definition', due_at: now.toISOString() },
        { onConflict: 'user_id,vocab_item_id,card_kind', ignoreDuplicates: true },
      );
    if (cardError) {
      console.error('[weekly-review] Could not ensure a card:', cardError.message);
      return { updated: false, dueAt: null };
    }

    const { data: card, error: cardReadError } = await admin
      .from('vocab_cards')
      .select('id, due_at, suspended, interval_days, stability, difficulty, fsrs_state, learning_steps, reps, lapses, last_review_at')
      .eq('user_id', userId)
      .eq('vocab_item_id', item.id)
      .eq('card_kind', 'definition')
      .maybeSingle();
    if (cardReadError || !card) return { updated: false, dueAt: null };

    // The marking route already graded this answer. Finishing again must not
    // count the same mistake as a new FSRS review or reset the learner's card.
    // A missing card was just created due now; an explicitly suspended one is
    // not available in the Review queue and must not be claimed as ready.
    if (options.ensureOnly) return { updated: !card.suspended, dueAt: card.due_at };

    const grade = correct ? 'good' : 'again';
    const next = scheduleFsrsReview(card, grade, now);

    // Through the same RPC the Review page uses, so the history row in
    // vocab_reviews and the FSRS fields stay consistent with a card graded by
    // hand.
    const { data: client, error: rpcError } = await admin.rpc('apply_fsrs_review', {
      p_card_type: 'vocab',
      p_card_id: card.id,
      p_grade: grade,
      p_due_at: next.due_at,
      p_interval_days: next.interval_days,
      p_stability: next.stability,
      p_difficulty: next.difficulty,
      p_fsrs_state: next.fsrs_state,
      p_learning_steps: next.learning_steps,
      p_reps: next.reps,
      p_lapses: next.lapses,
    });

    if (rpcError) {
      // apply_fsrs_review keys off auth.uid(), which a service-role call does not
      // have. The card fields are updated directly in that case: the learner
      // still gets the new due date, which is what requirement 2 is about.
      const { error: directError } = await admin
        .from('vocab_cards')
        .update({
          due_at: next.due_at,
          interval_days: next.interval_days,
          stability: next.stability,
          difficulty: next.difficulty,
          fsrs_state: next.fsrs_state,
          learning_steps: next.learning_steps,
          reps: next.reps,
          lapses: next.lapses,
          last_review_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', card.id)
        .eq('user_id', userId);
      if (directError) {
        console.error('[weekly-review] Could not update the card:', directError.message);
        return { updated: false, dueAt: null };
      }
    } else if (!client) {
      return { updated: false, dueAt: null };
    }

    return { updated: true, dueAt: next.due_at };
  } catch (error) {
    console.error('[weekly-review] Failed:', error instanceof Error ? error.message : error);
    return { updated: false, dueAt: null };
  }
}

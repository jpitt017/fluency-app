import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';
import { loadReviewQueue } from '@/lib/b1b2/data';

/**
 * "Review more": the cards the daily cap held back.
 *
 * The cap is a server decision, so lifting it cannot be a browser flag. This
 * route returns the rest of today's queue and changes nothing in the database:
 * it is the learner choosing to keep going, not a change to their schedule.
 * Tomorrow's allowance is unaffected, because the count only moves when a card
 * is actually graded.
 */
export async function POST() {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Review is not available right now.' }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to review.' }, { status: 401 });
  }

  const { signedIn, queue, totalDue } = await loadReviewQueue({ ignoreCap: true });
  if (!signedIn) {
    return NextResponse.json({ error: 'Sign in to review.' }, { status: 401 });
  }

  // Everything still due, not just the capped slice.
  return NextResponse.json(
    { cards: queue.cards, total: totalDue },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

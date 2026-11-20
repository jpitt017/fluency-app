import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/utils/supabase/server';
import { scheduleFsrsReview, type ReviewGrade } from '@/lib/b1b2/fsrs';

const ReviewRequestSchema = z.object({
  cardId: z.string().uuid(),
  cardType: z.enum(['vocab', 'error']).default('vocab'),
  grade: z.enum(['again', 'hard', 'good', 'easy']),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Database client is not configured.' }, { status: 503 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in to save SRS reviews.' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = ReviewRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid SRS review payload.' }, { status: 400 });
    }

    const { cardId, cardType, grade } = parsed.data;
    const table = cardType === 'error' ? 'error_review_cards' : 'vocab_cards';

    const { data: cardRow, error: fetchError } = await supabase
      .from(table)
      .select('id, due_at, interval_days, stability, difficulty, fsrs_state, learning_steps, reps, lapses, last_review_at')
      .eq('id', cardId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError || !cardRow) {
      return NextResponse.json({ error: 'Card not found.' }, { status: 404 });
    }

    const nextFsrs = scheduleFsrsReview(cardRow, grade as ReviewGrade);

    const { data: applied, error: rpcError } = await supabase.rpc('apply_fsrs_review', {
      p_card_type: cardType,
      p_card_id: cardId,
      p_grade: grade,
      p_due_at: nextFsrs.due_at,
      p_interval_days: nextFsrs.interval_days,
      p_stability: nextFsrs.stability,
      p_difficulty: nextFsrs.difficulty,
      p_fsrs_state: nextFsrs.fsrs_state,
      p_learning_steps: nextFsrs.learning_steps,
      p_reps: nextFsrs.reps,
      p_lapses: nextFsrs.lapses,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    return NextResponse.json({
      ...(applied as Record<string, unknown>),
      fsrs: nextFsrs,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save FSRS review' },
      { status: 500 },
    );
  }
}

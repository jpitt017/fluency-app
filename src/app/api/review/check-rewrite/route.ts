import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/utils/supabase/server';
import { computeWordDiff, normalizeSentenceForCompare } from '@/lib/b1b2/diff';

const CheckRewriteSchema = z.object({
  cardId: z.string().uuid(),
  rewrite: z.string().trim().min(1).max(600),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = CheckRewriteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Provide a valid cardId and rewrite sentence.' }, { status: 400 });
    }

    const { cardId, rewrite } = parsed.data;
    const { data: card, error: cardErr } = await supabase
      .from('error_review_cards')
      .select('id, prompt_sentence, corrected_sentence, explanation, category, mastered')
      .eq('id', cardId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (cardErr || !card) {
      return NextResponse.json({ error: 'Error review card not found.' }, { status: 404 });
    }

    const normRewrite = normalizeSentenceForCompare(rewrite);
    const normTarget = normalizeSentenceForCompare(card.corrected_sentence);
    const fixed = normRewrite === normTarget;

    const diffFromOriginal = computeWordDiff(card.prompt_sentence, rewrite);
    const diffToTarget = computeWordDiff(rewrite, card.corrected_sentence);

    let mastered = Boolean(card.mastered);
    let xpAwarded = 0;

    if (fixed && !mastered) {
      const { data: masteryRes } = await supabase.rpc('mark_error_card_mastered', {
        p_card_id: card.id,
        p_attempt_text: rewrite,
      });
      mastered = Boolean((masteryRes as { mastered?: boolean } | null)?.mastered ?? true);
      xpAwarded = Number((masteryRes as { xp?: number } | null)?.xp ?? 5);
    } else {
      await supabase
        .from('error_review_cards')
        .update({ last_attempt_text: rewrite })
        .eq('id', card.id)
        .eq('user_id', user.id);
    }

    return NextResponse.json({
      cardId: card.id,
      fixed,
      mastered,
      xpAwarded,
      diffFromOriginal,
      diffToTarget,
      correctedSentence: card.corrected_sentence,
      explanation: card.explanation,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to check rewrite' },
      { status: 500 },
    );
  }
}

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';
import { checkReviewPracticeItem } from '@/lib/curriculum/review-enrichment';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Deterministic (zero-AI) checker for extra practice items shown inside Review
 * ("Practise this rule" and "Practise this"). Never changes card scheduling or
 * writes to the database.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'We could not check your answer. Please try again.' }, { status: 503, headers: NO_STORE });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to practise.' }, { status: 401, headers: NO_STORE });
  }

  const body = (await request.json().catch(() => null)) as { itemId?: unknown; answer?: unknown } | null;
  if (
    !body ||
    typeof body.itemId !== 'string' ||
    !body.itemId.trim() ||
    typeof body.answer !== 'string' ||
    !body.answer.trim() ||
    body.answer.length > 500
  ) {
    return NextResponse.json({ error: 'Please check your answer.' }, { status: 400, headers: NO_STORE });
  }

  const result = checkReviewPracticeItem(body.itemId, body.answer);
  if (!result) {
    return NextResponse.json({ error: 'This practice item is not available.' }, { status: 404, headers: NO_STORE });
  }
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE });
  }

  return NextResponse.json(result, { headers: NO_STORE });
}

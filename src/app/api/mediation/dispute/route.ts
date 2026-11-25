import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';

/** Learner says "I think this is right": put the attempt in the teacher queue. */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  if (!supabase) {
    console.error('[mediation] database client is not configured');
    return NextResponse.json({ error: 'Something went wrong. Please try again, or message your teacher.' }, { status: 503 });
  }
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { attemptId?: string };
  if (!body.attemptId) {
    return NextResponse.json({ error: 'We could not send that. Please try again.' }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from('mediation_attempts')
    .update({ disputed: true, needs_review: true, review_reason: 'disputed' })
    .eq('id', body.attemptId)
    .eq('user_id', data.user.id)
    .select('id, needs_review, review_reason, disputed')
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: 'Could not flag this attempt.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, attempt: updated });
}

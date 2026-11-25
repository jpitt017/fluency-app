import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { createServerSupabase } from '@/utils/supabase/server';
import { getSpeakingSupportAnswer } from '@/lib/curriculum/week-speaking-support';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { week?: unknown; attemptId?: unknown; choice?: unknown } | null;
  const week = Number(body?.week);
  const attemptId = typeof body?.attemptId === 'string' ? body.attemptId : '';
  const choice = body?.choice;
  const config = getSpeakingSupportAnswer(week);
  if (!config || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)
    || !Number.isInteger(choice) || Number(choice) < 0 || Number(choice) >= config.options.length) {
    return NextResponse.json({ error: 'Choose one answer to continue.' }, { status: 400 });
  }
  const client = await createServerSupabase();
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!user) return NextResponse.json({ error: 'Sign in to save your answer.' }, { status: 401 });
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Answer checking is temporarily unavailable.' }, { status: 503 });

  const attempt = await admin.from('week_speaking_attempts').select('id,first_recording_path')
    .eq('id', attemptId).eq('user_id', user.id).eq('week_number', week).maybeSingle();
  if (attempt.error || !attempt.data?.first_recording_path) {
    return NextResponse.json({ error: 'Record your answer first to unlock this question.' }, { status: 403 });
  }

  const correct = Number(choice) === config.answerIndex;
  const saved = await admin.from('week_speaking_attempts').update({ focus_choice: Number(choice), focus_correct: correct })
    .eq('id', attemptId).eq('user_id', user.id).eq('week_number', week).select('id').maybeSingle();
  if (saved.error || !saved.data) {
    console.error('[week-speaking] focus answer save failed:', saved.error);
    return NextResponse.json({ error: 'We could not save your answer. Please try again.' }, { status: 503 });
  }
  return NextResponse.json({ correct, feedback: correct ? config.feedback : 'Listen again and try once more.' });
}

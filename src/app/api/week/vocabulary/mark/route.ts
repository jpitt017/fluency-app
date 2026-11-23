import { NextResponse } from 'next/server';
import bank from '@/supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json';
import { markVocabularyAnswer } from '@/lib/curriculum/vocabulary-marking.mjs';
import { createServerSupabase } from '@/utils/supabase/server';
import { createAdminSupabase } from '@/utils/supabase/admin';

/** The answer bank remains server-side; only the checked item's feedback is returned. */
export async function POST(request: Request) {
  const client = await createServerSupabase();
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) return NextResponse.json({ error: 'Sign in to check your answer.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { week?: unknown; id?: unknown; answer?: unknown } | null;
  if (!body || !Number.isInteger(body.week) || typeof body.id !== 'string' || typeof body.answer !== 'string' || body.answer.length > 500) {
    return NextResponse.json({ error: 'Please check your answer.' }, { status: 400 });
  }
  const week = bank.weeks.find(entry => entry.week === body.week);
  if (!week) return NextResponse.json({ error: 'This activity is not available.' }, { status: 404 });
  const progress = await client.rpc('refresh_current_week');
  if (progress.error) return NextResponse.json({ error: 'Could not check your progress.' }, { status: 503 });
  if (week.week > Number(progress.data)) return NextResponse.json({ error: 'This week is not open yet.' }, { status: 403 });
  let result: { correct: boolean; feedback: string; nearly?: boolean };
  try { result = markVocabularyAnswer(week, body.id, body.answer); }
  catch { return NextResponse.json({ error: 'Please check your answer.' }, { status: 400 }); }
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Could not save your answer.' }, { status: 503 });
  const { error } = await admin.from('week_vocabulary_attempts').insert({
    user_id: user.id, week_number: week.week, item_id: body.id, answer: body.answer.trim(), correct: result.correct,
  });
  if (error) {
    console.error('[vocabulary] Failed to save attempt:', error.message);
    return NextResponse.json({ error: 'Could not save your answer. Please try again.' }, { status: 503 });
  }
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

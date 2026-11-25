import { NextResponse } from 'next/server';
import details from '@/supabase-b1-b2/content/curriculum/weeks-01-04-details.json';
import content from '@/supabase-b1-b2/content/curriculum/reading-support-weeks-01-04.json';
import { markReadingGloss } from '@/lib/curriculum/reading-support.mjs';
import { createServerSupabase } from '@/utils/supabase/server';
import { createAdminSupabase } from '@/utils/supabase/admin';

/** Optional reading gloss practice, available only after all checked reading answers are saved. */
export async function POST(request: Request) {
  const client = await createServerSupabase();
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) return NextResponse.json({ error: 'Sign in to check your answer.' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { week?: unknown; itemId?: unknown; answer?: unknown }
    | null;
  if (!body || !Number.isInteger(body.week) || typeof body.itemId !== 'string' || typeof body.answer !== 'string') {
    return NextResponse.json({ error: 'Please check your answer.' }, { status: 400 });
  }
  const week = body.week as number;
  const progress = await client.rpc('refresh_current_week');
  if (progress.error) return NextResponse.json({ error: 'Could not check your progress.' }, { status: 503 });
  if (week > Number(progress.data)) return NextResponse.json({ error: 'This week is not open yet.' }, { status: 403 });

  const fallbackQuestions = details.reading.weeks.find((entry) => entry.week === week)?.questions ?? [];
  const questionBank = await client
    .from('syllabus_input_items_safe')
    .select('payload')
    .eq('week_number', week)
    .eq('mode', 'reading')
    .order('sort_order');
  const questions = questionBank.data?.length
    ? questionBank.data.map((row) => row.payload as { id?: unknown })
    : fallbackQuestions;
  const questionIds = questions.map((question) => question.id).filter((id): id is string => typeof id === 'string');
  if (questionIds.length === 0) return NextResponse.json({ error: 'This check is not available.' }, { status: 404 });
  const saved = await client
    .from('week_input_answers')
    .select('item_id')
    .eq('user_id', user.id)
    .eq('week_number', week)
    .eq('skill', 'reading');
  if (saved.error) return NextResponse.json({ error: 'Could not check your reading progress.' }, { status: 503 });
  const savedIds = new Set((saved.data ?? []).map((row) => row.item_id as string));
  if (!questionIds.every((id) => savedIds.has(id))) {
    return NextResponse.json({ error: 'Answer the reading questions first.' }, { status: 403 });
  }

  let marked: { correct: boolean; answer: string; feedback: string };
  try {
    marked = markReadingGloss(content, week, body.itemId, body.answer);
  } catch {
    return NextResponse.json({ error: 'Please check your answer.' }, { status: 400 });
  }
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Could not save your answer.' }, { status: 503 });
  const { error } = await admin.from('week_input_answers').upsert(
    {
      user_id: user.id,
      week_number: week,
      skill: 'reading',
      item_id: body.itemId,
      answer: body.answer.slice(0, 500),
      correct: marked.correct,
    },
    { onConflict: 'user_id,week_number,skill,item_id' },
  );
  if (error) {
    console.error('[reading-gloss] Failed to save attempt:', error.message);
    return NextResponse.json({ error: 'Could not save your answer. Please try again.' }, { status: 503 });
  }
  return NextResponse.json(
    { correct: marked.correct, answer: marked.answer, feedback: marked.feedback },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

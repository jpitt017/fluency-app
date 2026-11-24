import { NextResponse } from 'next/server';
import content from '@/supabase-b1-b2/content/curriculum/listening-support-weeks-01-04.json';
import { markGloss } from '@/lib/curriculum/listening-support.mjs';
import { createServerSupabase } from '@/utils/supabase/server';
import { createAdminSupabase } from '@/utils/supabase/admin';

/**
 * Mark one gloss-check item.
 *
 * The four items are one encouraged bonus task: they do not unlock anything, so
 * this route never advances the learner's week. `refresh_current_week` reads
 * speaking, writing and the listening/reading submission flags only, and this
 * route writes none of those.
 *
 * Where the attempt goes: the same `week_input_answers` table that already holds
 * per-question reading and listening answers, under `skill = 'listening'` and an
 * item id of `gloss-<week>-<n>`. That table is already in "Delete my data", so
 * the gloss attempts are covered without a new migration. The id prefix keeps
 * them out of the transcript gate, which counts only the real listening item
 * ids.
 *
 * `answerIndex` never leaves this file: the response carries the verdict, the
 * right choice (now that the learner has committed to one) and the authored
 * one-line feedback.
 */
export async function POST(request: Request) {
  const client = await createServerSupabase();
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) {
    return NextResponse.json({ error: 'Sign in to check your answer.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { week?: unknown; itemId?: unknown; answer?: unknown }
    | null;
  if (!body || !Number.isInteger(body.week) || typeof body.itemId !== 'string' || typeof body.answer !== 'string') {
    return NextResponse.json({ error: 'Please check your answer.' }, { status: 400 });
  }

  const week = body.week as number;
  const progress = await client.rpc('refresh_current_week');
  if (progress.error) return NextResponse.json({ error: 'Could not check your progress.' }, { status: 503 });
  if (week > Number(progress.data)) {
    return NextResponse.json({ error: 'This week is not open yet.' }, { status: 403 });
  }

  let marked: { correct: boolean; answer: string; feedback: string };
  try {
    marked = markGloss(content, week, body.itemId, body.answer);
  } catch {
    return NextResponse.json({ error: 'Please check your answer.' }, { status: 400 });
  }

  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Could not save your answer.' }, { status: 503 });
  const { error } = await admin.from('week_input_answers').upsert(
    {
      user_id: user.id,
      week_number: week,
      skill: 'listening',
      item_id: body.itemId,
      answer: body.answer.slice(0, 500),
      correct: marked.correct,
    },
    { onConflict: 'user_id,week_number,skill,item_id' },
  );
  if (error) {
    console.error('[gloss] Failed to save attempt:', error.message);
    return NextResponse.json({ error: 'Could not save your answer. Please try again.' }, { status: 503 });
  }

  return NextResponse.json(
    { correct: marked.correct, answer: marked.answer, feedback: marked.feedback },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

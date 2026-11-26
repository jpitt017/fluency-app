import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';
import { readStoredCurrentWeek } from '@/lib/curriculum/stored-current-week';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { loadLearnerWeek } from '@/lib/curriculum/learner-week';
import { loadPlayableTrialAudio } from '@/lib/curriculum/load-listening-audio';

/** Save completion only after every question has a saved, server-checked answer. */
export async function POST(request: Request) {
  const client = await createServerSupabase();
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) return NextResponse.json({ error: 'Sign in to save your answers.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { week?: unknown; skill?: unknown } | null;
  if (!body || !Number.isInteger(body.week) || (body.skill !== 'reading' && body.skill !== 'listening')) {
    return NextResponse.json({ error: 'Please check your answers.' }, { status: 400 });
  }
  const weekNumber = body.week as number;
  const current = await readStoredCurrentWeek(client, user.id);
  if (current === null) return NextResponse.json({ error: 'Could not check your progress.' }, { status: 503 });
  if (weekNumber < 1 || weekNumber > current) return NextResponse.json({ error: 'This week is not open yet.' }, { status: 403 });
  const week = await loadLearnerWeek(weekNumber);
  const task = week?.[body.skill];
  // The page accepts either its original recording or an approved trial track.
  // Use the same approval gate here: an unreleased track never opens a task.
  const trial = body.skill === 'listening' && task && !task.audioUrl
    ? await loadPlayableTrialAudio(weekNumber) : null;
  if (!task || (body.skill === 'listening' && !task.audioUrl && !trial) || !task.questions.length) {
    return NextResponse.json({ error: 'This task is not available yet.' }, { status: 400 });
  }

  // Read the actual answers recorded by /mark, not placeholder answers or a
  // completion count from the browser. Wrong answers count as checked too.
  const { data: answers, error: readError } = await client.from('week_input_answers')
    .select('item_id')
    .eq('user_id', user.id)
    .eq('week_number', weekNumber)
    .eq('skill', body.skill);
  if (readError) {
    console.error('[input] Could not read checked answers:', readError);
    return NextResponse.json({ error: 'We could not save your answers. Please try again.' }, { status: 503 });
  }
  const checked = new Set((answers ?? []).map((answer) => answer.item_id as string));
  if (!task.questions.every((question) => checked.has(question.id))) {
    return NextResponse.json({ error: 'Please check every answer first.' }, { status: 400 });
  }

  try {
    const admin = createAdminSupabase();
    if (!admin) {
      console.error('[input] Could not save completion: admin client is not configured');
      return NextResponse.json({ error: 'We could not save your answers. Please try again.' }, { status: 503 });
    }
    const { error } = await admin.from('week_input_submissions').upsert({ user_id: user.id, week_number: weekNumber, skill: body.skill }, { onConflict: 'user_id,week_number,skill', ignoreDuplicates: true });
    if (error) {
      console.error('[input] Could not save completion:', error);
      return NextResponse.json({ error: 'We could not save your answers. Please try again.' }, { status: 503 });
    }
  } catch (error) {
    console.error('[input] Could not save completion:', error);
    return NextResponse.json({ error: 'We could not save your answers. Please try again.' }, { status: 503 });
  }
  // Progress recomputes on the next explicit page visit, not on every task POST.
  return NextResponse.json({ saved: true, currentWeek: current });
}

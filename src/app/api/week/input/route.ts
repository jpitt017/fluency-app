import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { loadLearnerWeek } from '@/lib/curriculum/learner-week';

/** Save completion only after every question has an answer. No answers are exposed. */
export async function POST(request: Request) {
  const client = await createServerSupabase();
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) return NextResponse.json({ error: 'Sign in to save your answers.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { week?: unknown; skill?: unknown; answers?: unknown } | null;
  if (!body || !Number.isInteger(body.week) || (body.skill !== 'reading' && body.skill !== 'listening') || !body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) {
    return NextResponse.json({ error: 'Please check your answers.' }, { status: 400 });
  }
  const weekNumber = body.week as number;
  const { data: current, error: progressError } = await client.rpc('refresh_current_week');
  if (progressError) return NextResponse.json({ error: 'Could not check your progress.' }, { status: 503 });
  if (weekNumber < 1 || weekNumber > Number(current)) return NextResponse.json({ error: 'This week is not open yet.' }, { status: 403 });
  const week = await loadLearnerWeek(weekNumber);
  const task = week?.[body.skill];
  if (!task || (body.skill === 'listening' && !task.audioUrl) || !task.questions.length) return NextResponse.json({ error: 'This task is not available yet.' }, { status: 400 });
  const answers = body.answers as Record<string, unknown>;
  if (!task.questions.every(q => typeof answers[q.id] === 'string' && (answers[q.id] as string).trim().length > 0 && (answers[q.id] as string).length <= 500 && (!q.options.length || q.options.includes(answers[q.id] as string)))) {
    return NextResponse.json({ error: 'Please answer every question.' }, { status: 400 });
  }
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Saving is not available right now.' }, { status: 503 });
  const { error } = await admin.from('week_input_submissions').upsert({ user_id: user.id, week_number: weekNumber, skill: body.skill }, { onConflict: 'user_id,week_number,skill', ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: 'Could not save your answers.' }, { status: 503 });
  const refreshed = await client.rpc('refresh_current_week');
  if (refreshed.error) return NextResponse.json({ error: 'Answers saved, but progress could not be updated.' }, { status: 503 });
  return NextResponse.json({ saved: true, currentWeek: refreshed.data });
}

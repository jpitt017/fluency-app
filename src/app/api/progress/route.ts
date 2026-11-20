import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';

/**
 * Lesson completion for the B1 → B2 course, addressed by lesson number.
 * The lesson id is resolved server-side so the client never sends row ids.
 */
async function resolveLesson(supabase: Awaited<ReturnType<typeof createServerSupabase>>, lessonNumber: number) {
  if (!supabase) return { error: 'Supabase is not configured', status: 500 as const };

  const { data, error } = await supabase.from('lessons').select('id, lesson_number').eq('lesson_number', lessonNumber).maybeSingle();
  if (error) return { error: error.message, status: 400 as const };
  if (!data) return { error: `Lesson ${lessonNumber} does not exist`, status: 404 as const };
  return { lesson: data };
}

export async function GET(request: NextRequest) {
  const lessonNumber = Number(request.nextUrl.searchParams.get('lessonNumber'));
  if (!Number.isInteger(lessonNumber) || lessonNumber < 1 || lessonNumber > 112) {
    return NextResponse.json({ error: 'lessonNumber must be between 1 and 112' }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured' }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ completed: false, signedIn: false });

  const resolved = await resolveLesson(supabase, lessonNumber);
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const { data, error } = await supabase
    .from('lesson_progress')
    .select('status, practice_correct, practice_total, completed_at')
    .eq('user_id', user.id)
    .eq('lesson_id', resolved.lesson.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    completed: data?.status === 'completed',
    signedIn: true,
    progress: data ?? null,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured' }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    lessonNumber?: number;
    completed?: boolean;
    score?: number | null;
    correctCount?: number;
    totalCount?: number;
  };

  const lessonNumber = Number(body.lessonNumber);
  if (!Number.isInteger(lessonNumber) || lessonNumber < 1 || lessonNumber > 112) {
    return NextResponse.json({ error: 'lessonNumber must be between 1 and 112' }, { status: 400 });
  }

  const resolved = await resolveLesson(supabase, lessonNumber);
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const completed = body.completed !== false;
  const correct = Math.max(0, Number(body.correctCount ?? body.score ?? 0) || 0);
  const total = Math.max(0, Number(body.totalCount) || 0);

  const { data, error } = await supabase
    .from('lesson_progress')
    .upsert(
      {
        user_id: user.id,
        lesson_id: resolved.lesson.id,
        status: completed ? 'completed' : 'in_progress',
        blocks_completed: completed ? 5 : 1,
        practice_correct: correct,
        practice_total: total,
        completed_at: completed ? new Date().toISOString() : null,
        last_viewed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,lesson_id' },
    )
    .select('lesson_id, status, practice_correct, practice_total, completed_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ completed: data.status === 'completed', progress: data });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';

type ProgressBody = {
  action?: 'complete' | 'preference' | 'review';
  lessonNumber?: number;
  completed?: boolean;
  correctCount?: number;
  totalCount?: number;
  outputSubmitted?: boolean;
  targetHoursPerWeek?: number;
  cardId?: string;
  grade?: 'again' | 'hard' | 'good' | 'easy';
};

const GRADES = new Set(['again', 'hard', 'good', 'easy']);

/**
 * Learner progress for the B1 → B2 course.
 *
 * GET  — lesson rows, weekly-hours preference and the due review count.
 * POST — complete a lesson (by lesson number; the id is resolved server-side),
 *        set a preference, or grade a vocabulary card.
 */
export async function GET() {
  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured' }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ progress: [], targetHoursPerWeek: 4, dueCards: 0, signedIn: false });
  }

  const [progressResult, prefsResult, dueResult] = await Promise.all([
    supabase
      .from('lesson_progress')
      .select('lesson_id, status, practice_correct, practice_total, output_submitted, completed_at, lessons!inner(lesson_number, module_lesson_number, title, primary_skill, can_do)')
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(200),
    supabase.from('curriculum_preferences').select('target_hours_per_week').maybeSingle(),
    supabase
      .from('vocab_cards')
      .select('id', { count: 'exact', head: true })
      .lte('due_at', new Date().toISOString())
      .eq('suspended', false),
  ]);

  if (progressResult.error) {
    return NextResponse.json({ error: progressResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    signedIn: true,
    progress: progressResult.data ?? [],
    targetHoursPerWeek: prefsResult.data?.target_hours_per_week ?? 4,
    dueCards: dueResult.count ?? 0,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured' }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Sign in to save progress' }, { status: 401 });

  let body: ProgressBody;
  try {
    body = (await request.json()) as ProgressBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.action === 'preference') {
    const target = Number(body.targetHoursPerWeek);
    if (!Number.isFinite(target) || target < 1 || target > 40) {
      return NextResponse.json({ error: 'targetHoursPerWeek must be between 1 and 40' }, { status: 400 });
    }
    const { error } = await supabase
      .from('curriculum_preferences')
      .upsert({ user_id: user.id, target_hours_per_week: target, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, targetHoursPerWeek: target });
  }

  if (body.action === 'review') {
    if (!body.cardId || !body.grade || !GRADES.has(body.grade)) {
      return NextResponse.json({ error: 'cardId and a valid grade are required' }, { status: 400 });
    }
    const { data, error } = await supabase.rpc('review_vocab_card', { p_card_id: body.cardId, p_grade: body.grade });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, card: data });
  }

  const lessonNumber = Number(body.lessonNumber);
  if (!Number.isInteger(lessonNumber) || lessonNumber < 1 || lessonNumber > 112) {
    return NextResponse.json({ error: 'lessonNumber must be between 1 and 112' }, { status: 400 });
  }

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('id, lesson_number, output_required')
    .eq('lesson_number', lessonNumber)
    .maybeSingle();

  if (lessonError) return NextResponse.json({ error: lessonError.message }, { status: 400 });
  if (!lesson) return NextResponse.json({ error: `Lesson ${lessonNumber} does not exist` }, { status: 404 });

  const { data: existing } = await supabase
    .from('lesson_progress')
    .select('status, completed_at, output_submitted, practice_correct, practice_total')
    .eq('user_id', user.id)
    .eq('lesson_id', lesson.id)
    .maybeSingle();

  const completed = Boolean(body.completed);
  const alreadyCompleted = existing?.status === 'completed';
  const practiceCorrect = Math.max(0, Number(body.correctCount) || 0);
  const practiceTotal = Math.max(0, Number(body.totalCount) || 0);

  const row = {
    user_id: user.id,
    lesson_id: lesson.id,
    status: completed ? 'completed' : existing?.status ?? 'in_progress',
    blocks_completed: completed ? 5 : 1,
    practice_correct: practiceTotal ? practiceCorrect : existing?.practice_correct ?? 0,
    practice_total: practiceTotal || existing?.practice_total || 0,
    output_submitted: Boolean(body.outputSubmitted) || Boolean(existing?.output_submitted),
    completed_at: completed ? existing?.completed_at ?? new Date().toISOString() : existing?.completed_at ?? null,
    last_viewed_at: new Date().toISOString(),
  };

  const { data: saved, error: upsertError } = await supabase
    .from('lesson_progress')
    .upsert(row, { onConflict: 'user_id,lesson_id' })
    .select('lesson_id, status, practice_correct, practice_total, output_submitted, completed_at')
    .single();

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    lessonNumber,
    alreadyCompleted,
    progress: saved,
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured' }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Sign in to save preferences' }, { status: 401 });

  let body: ProgressBody;
  try {
    body = (await request.json()) as ProgressBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const target = Number(body.targetHoursPerWeek);
  if (!Number.isFinite(target) || target < 1 || target > 40) {
    return NextResponse.json({ error: 'targetHoursPerWeek must be between 1 and 40' }, { status: 400 });
  }

  const { error } = await supabase
    .from('curriculum_preferences')
    .upsert(
      { user_id: user.id, target_hours_per_week: target, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, targetHoursPerWeek: target });
}

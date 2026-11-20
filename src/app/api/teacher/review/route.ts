import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';

const VALID_TYPES = new Set(['speaking', 'writing', 'checkpoint']);
const VALID_STATUSES = new Set(['pending', 'confirmed', 'needs_work', 'overridden']);
const VALID_DECISIONS = new Set(['ready_for_b2_exam_prep', 'named_next_step']);

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    targetType?: string;
    targetId?: string;
    teacherStatus?: string;
    teacherNotes?: string | null;
    pronunciationNote?: string | null;
    readinessDecision?: string | null;
  } | null;

  if (!body || !body.targetType || !VALID_TYPES.has(body.targetType)) {
    return NextResponse.json({ error: 'targetType must be speaking, writing, or checkpoint' }, { status: 400 });
  }
  if (!body.targetId) {
    return NextResponse.json({ error: 'targetId is required' }, { status: 400 });
  }
  if (!body.teacherStatus || !VALID_STATUSES.has(body.teacherStatus)) {
    return NextResponse.json({ error: 'Invalid teacherStatus' }, { status: 400 });
  }
  if (body.readinessDecision && !VALID_DECISIONS.has(body.readinessDecision)) {
    return NextResponse.json({ error: 'Invalid readinessDecision' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('teacher_submit_review', {
    p_target_type: body.targetType,
    p_target_id: body.targetId,
    p_teacher_status: body.teacherStatus,
    p_teacher_notes: body.teacherNotes?.trim() || null,
    p_pronunciation_note: body.pronunciationNote?.trim() || null,
    p_readiness_decision: body.readinessDecision || null,
  });

  if (error) {
    const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true, result: data });
}

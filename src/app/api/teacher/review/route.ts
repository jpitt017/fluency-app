import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { SPEAKING_AREA_KEYS, WRITING_AREA_KEYS } from '@/lib/b1b2/feedback-schema';

const VALID_TYPES = new Set(['speaking', 'writing', 'checkpoint', 'week_speaking_take']);
const VALID_STATUSES = new Set(['pending', 'confirmed', 'needs_work', 'overridden']);
const VALID_DECISIONS = new Set(['ready_for_b2_exam_prep', 'named_next_step']);

function sanitizeAreaMarks(
  raw: unknown,
  allowedKeys: readonly string[],
): { ok: true; marks: Record<string, number> | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, marks: null };
  if (typeof raw !== 'object') return { ok: false, error: 'areaMarks must be an object' };
  const out: Record<string, number> = {};
  for (const key of allowedKeys) {
    const val = (raw as Record<string, unknown>)[key];
    if (val === null || val === undefined || val === '') continue;
    const num = Number(val);
    if (!Number.isInteger(num) || num < 0 || num > 5) {
      return { ok: false, error: `${key} mark must be an integer from 0 to 5` };
    }
    out[key] = num;
  }
  return { ok: true, marks: out };
}

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
    areaMarks?: Record<string, number | null> | null;
  } | null;

  if (!body || !body.targetType || !VALID_TYPES.has(body.targetType)) {
    return NextResponse.json(
      { error: 'targetType must be speaking, writing, checkpoint, or week_speaking_take' },
      { status: 400 },
    );
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

  let validatedAreaMarks: Record<string, number> | null = null;
  if (body.areaMarks !== undefined && body.targetType !== 'checkpoint') {
    const allowedKeys =
      body.targetType === 'writing' ? WRITING_AREA_KEYS : SPEAKING_AREA_KEYS;
    const parsedMarks = sanitizeAreaMarks(body.areaMarks, allowedKeys);
    if (!parsedMarks.ok) {
      return NextResponse.json({ error: parsedMarks.error }, { status: 400 });
    }
    validatedAreaMarks = parsedMarks.marks;
  }

  let rpcData: unknown = null;

  if (body.targetType === 'week_speaking_take') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.role !== 'teacher' && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Teacher access required' }, { status: 403 });
    }
  } else {
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
    rpcData = data;
  }

  if (validatedAreaMarks !== null && body.targetType !== 'checkpoint') {
    const admin = createAdminSupabase();
    if (admin) {
      const sanitizedMarks = validatedAreaMarks;
      {
        const table =
          body.targetType === 'writing'
            ? 'writing_submissions'
            : body.targetType === 'speaking'
              ? 'speaking_attempts'
              : 'week_speaking_takes';
        const { data: current } = await admin
          .from(table)
          .select('feedback')
          .eq('id', body.targetId)
          .maybeSingle();
        if (current) {
          const existingFeedback =
            current.feedback && typeof current.feedback === 'object'
              ? (current.feedback as Record<string, unknown>)
              : {};
          const nextFeedback: Record<string, unknown> = {
            ...existingFeedback,
            teacherAreaMarks: sanitizedMarks,
            ...(body.targetType === 'week_speaking_take'
              ? {
                  teacherStatus: body.teacherStatus,
                  teacherNotes: body.teacherNotes?.trim() || null,
                  teacherPronunciationNote: body.pronunciationNote?.trim() || null,
                }
              : {}),
          };
          const updatePayload: Record<string, unknown> = { feedback: nextFeedback };
          if (body.targetType === 'speaking' && typeof sanitizedMarks.pronunciation === 'number') {
            updatePayload.pronunciation = sanitizedMarks.pronunciation;
          }
          await admin.from(table).update(updatePayload).eq('id', body.targetId);
        } else if (body.targetType === 'week_speaking_take') {
          return NextResponse.json({ error: 'Target record not found' }, { status: 404 });
        }
      }
    }
  }

  return NextResponse.json({ ok: true, result: rpcData });
}

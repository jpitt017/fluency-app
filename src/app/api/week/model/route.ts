import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { modelFor, type Skill } from '@/lib/curriculum/week-models';

/** A model is returned only after an explicit authenticated request and audit save. */
export async function POST(request: Request) {
  const client = await createServerSupabase();
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) return NextResponse.json({ error: 'Sign in to see the model answer.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { week?: unknown; skill?: unknown; confirmEarly?: unknown } | null;
  if (!body || !Number.isInteger(body.week) || (body.skill !== 'speaking' && body.skill !== 'writing') || (body.confirmEarly !== undefined && typeof body.confirmEarly !== 'boolean')) {
    return NextResponse.json({ error: 'Please check your request.' }, { status: 400 });
  }
  const week = body.week as number;
  const skill = body.skill as Skill;
  const model = modelFor(week, skill);
  if (!model) return NextResponse.json({ error: 'No model answer is available for this task yet.' }, { status: 404 });
  const progress = await client.rpc('refresh_current_week');
  if (progress.error) return NextResponse.json({ error: 'Could not check your progress.' }, { status: 503 });
  if (week < 1 || week > Number(progress.data)) return NextResponse.json({ error: 'This week is not open yet.' }, { status: 403 });
  const submission = await client.from('week_output_submissions').select('submitted_at').eq('user_id', user.id).eq('week_number', week).eq('skill', skill).maybeSingle();
  if (submission.error) return NextResponse.json({ error: 'Could not check your submission.' }, { status: 503 });
  const before = !submission.data;
  if (before && body.confirmEarly !== true) return NextResponse.json({ confirmationRequired: true }, { status: 409 });
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Could not save your choice.' }, { status: 503 });
  const saved = await admin.from('week_model_views').upsert({ user_id: user.id, week_number: week, skill, viewed_before_submission: before }, { onConflict: 'user_id,week_number,skill', ignoreDuplicates: true });
  if (saved.error) return NextResponse.json({ error: 'Could not save your choice.' }, { status: 503 });
  return NextResponse.json({ model }, { headers: { 'Cache-Control': 'no-store' } });
}

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { b1Curriculum } from '@/lib/curriculum';

async function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase is not configured.');
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => { try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Read-only request context */ } },
    },
  });
}

export async function GET() {
  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const [progress, preferences, reviews] = await Promise.all([
      supabase.from('lesson_progress').select('module_number,lesson_number,status,score,completed_at,updated_at').eq('user_id', user.id),
      supabase.from('curriculum_preferences').select('target_hours_per_week').eq('user_id', user.id).maybeSingle(),
      supabase.from('vocabulary_review_items').select('id,module_number,prompt,answer,due_at,interval_days,repetitions').eq('user_id', user.id).is('completed_at', null).lte('due_at', new Date().toISOString()).order('due_at').limit(20),
    ]);
    const failed = [progress.error, preferences.error, reviews.error].find(Boolean);
    if (failed) throw failed;
    return NextResponse.json({ progress: progress.data ?? [], targetHoursPerWeek: preferences.data?.target_hours_per_week ?? 4, dueReviews: reviews.data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load curriculum progress.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => null);
    if (body?.action === 'preference') {
      const target = Number(body.targetHoursPerWeek);
      if (![2, 4, 8].includes(target)) return NextResponse.json({ error: 'Choose a pace of 2, 4, or 8 hours per week.' }, { status: 400 });
      const { error } = await supabase.from('curriculum_preferences').upsert({ user_id: user.id, target_hours_per_week: target, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
      return NextResponse.json({ targetHoursPerWeek: target });
    }
    if (body?.action === 'review') {
      const moduleNumber = Number(body.moduleNumber);
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 300) : '';
      const answer = typeof body.answer === 'string' ? body.answer.trim().slice(0, 500) : '';
      if (!b1Curriculum.modules.some((item) => item.module_number === moduleNumber) || !prompt || !answer) return NextResponse.json({ error: 'A valid module, prompt, and answer are required.' }, { status: 400 });
      const { data, error } = await supabase.from('vocabulary_review_items').insert({ user_id: user.id, module_number: moduleNumber, prompt, answer }).select('id,module_number,prompt,answer,due_at,interval_days,repetitions').single();
      if (error) throw error;
      return NextResponse.json({ review: data });
    }
    if (body?.action === 'review-complete') {
      const id = typeof body.id === 'string' ? body.id : '';
      const remembered = Boolean(body.remembered);
      if (!id) return NextResponse.json({ error: 'Review item id is required.' }, { status: 400 });
      const { data: current, error: readError } = await supabase.from('vocabulary_review_items').select('interval_days,repetitions').eq('id', id).eq('user_id', user.id).single();
      if (readError) throw readError;
      const intervalDays = remembered ? Math.min(60, Math.max(1, current.interval_days * (current.repetitions ? 2 : 1))) : 1;
      const { error } = await supabase.from('vocabulary_review_items').update({ repetitions: remembered ? current.repetitions + 1 : 0, interval_days: intervalDays, due_at: new Date(Date.now() + intervalDays * 86400000).toISOString(), completed_at: remembered ? new Date().toISOString() : null }).eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      return NextResponse.json({ ok: true, intervalDays });
    }

    const moduleNumber = Number(body?.moduleNumber);
    const lessonNumber = Number(body?.lessonNumber);
    const completed = Boolean(body?.completed);
    const module = b1Curriculum.modules.find((item) => item.module_number === moduleNumber);
    if (!module?.lessons.some((item) => item.lesson_number === lessonNumber)) return NextResponse.json({ error: 'Invalid module or lesson.' }, { status: 400 });
    const score = typeof body?.score === 'number' && Number.isFinite(body.score) ? Math.max(0, Math.min(100, body.score)) : null;
    const { data, error } = await supabase.from('lesson_progress').upsert({
      user_id: user.id, module_number: moduleNumber, lesson_number: lessonNumber,
      status: completed ? 'completed' : 'in_progress', score,
      completed_at: completed ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,module_number,lesson_number' }).select().single();
    if (error) throw error;
    return NextResponse.json({ progress: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save curriculum progress.' }, { status: 500 });
  }
}

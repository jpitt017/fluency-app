import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { finishPractice, type FinishSkill } from '@/lib/curriculum/week-practice-finish';

/**
 * "Finish grammar" / "Finish vocabulary" on /week/[n].
 *
 * The saving is the server's job. The per-item answers are already stored by
 * /api/week/grammar/mark and /api/week/vocabulary/mark; this route reads those
 * rows, counts them, writes one completion record and puts the mistakes in
 * Review. Nothing in the request body can change a count.
 */
export async function POST(request: Request) {
  const client = await createServerSupabase();
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) return NextResponse.json({ error: 'Sign in to save your progress.' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { week?: unknown; skill?: unknown } | null;
  const skill = body?.skill;
  if (
    !body ||
    !Number.isInteger(body.week) ||
    (skill !== 'grammar' && skill !== 'vocabulary')
  ) {
    return NextResponse.json({ error: 'Please check your answers.' }, { status: 400 });
  }

  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Saving is not available right now.' }, { status: 503 });

  const result = await finishPractice({
    admin,
    client,
    userId: user.id,
    skill: skill as FinishSkill,
    week: body.week as number,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, remaining: result.remaining },
      { status: result.status },
    );
  }

  return NextResponse.json(
    { saved: true, summary: result.summary },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

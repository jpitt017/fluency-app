import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { createServerSupabase } from '@/utils/supabase/server';
import { speakingNoticeChoices, revealSpeakingNotice } from '@/lib/curriculum/week-speaking-support';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { week?: unknown; attemptId?: unknown; selected?: unknown } | null;
  const week = Number(body?.week);
  const attemptId = typeof body?.attemptId === 'string' ? body.attemptId : '';
  const choices = speakingNoticeChoices(week);
  const selected = body?.selected;
  if (!choices || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)
    || !Array.isArray(selected) || selected.length > choices.length
    || selected.some((item) => typeof item !== 'string' || !choices.includes(item))
    || new Set(selected).size !== selected.length) {
    return NextResponse.json({ error: 'Your phrase choices were not valid. Please try again.' }, { status: 400 });
  }
  const client = await createServerSupabase();
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!user) return NextResponse.json({ error: 'Sign in to save your choices.' }, { status: 401 });
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Saving your choices is temporarily unavailable.' }, { status: 503 });

  const saved = await admin.from('week_speaking_attempts').update({ notice_selected: selected })
    .eq('id', attemptId).eq('user_id', user.id).eq('week_number', week).not('first_recording_path', 'is', null).select('id').maybeSingle();
  if (saved.error || !saved.data) {
    console.error('[week-speaking] notice choices save failed:', saved.error);
    return NextResponse.json({ error: 'We could not save your choices. Please try again.' }, { status: 503 });
  }
  const reveal = revealSpeakingNotice(week);
  return NextResponse.json({ saved: true, ...reveal });
}

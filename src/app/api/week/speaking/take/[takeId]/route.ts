import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { createWeekSpeakingSignedUrl, parseWeekSpeakingTakePath } from '@/lib/b1b2/week-speaking-recordings.mjs';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'cache-control': 'private, no-store, max-age=0' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function error(status: number, message: string) { return NextResponse.json({ error: message }, { status, headers: NO_STORE }); }

/** Authorise every playback and mint a private 60-second URL, including for staff. */
export async function GET(_request: Request, { params }: { params: Promise<{ takeId: string }> }) {
  try {
    const { takeId } = await params;
    if (!UUID.test(takeId)) return error(404, 'Recording not found.');
    const supabase = await createServerSupabase();
    if (!supabase) return error(503, 'Playback is temporarily unavailable.');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return error(401, 'Sign in required.');
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const isStaff = profile?.role === 'teacher' || profile?.role === 'admin';
    const readClient = isStaff ? (createAdminSupabase() ?? supabase) : supabase;
    let query = readClient.from('week_speaking_takes').select('id,user_id,week_number,attempt_id,recording_path,status').eq('id', takeId);
    if (!isStaff) query = query.eq('user_id', user.id);
    const { data: take, error: queryError } = await query.maybeSingle();
    if (queryError || !take || !['ready', 'checking', 'checked', 'abandoned'].includes(take.status)) return error(404, 'Recording not found.');
    const parsed = parseWeekSpeakingTakePath(take.recording_path);
    if (!parsed || parsed.userId !== take.user_id || parsed.weekNumber !== Number(take.week_number)
      || parsed.attemptId !== take.attempt_id || parsed.takeId !== take.id) return error(404, 'Recording not found.');
    const signed = await createWeekSpeakingSignedUrl(readClient, take.recording_path);
    if (!signed.signedUrl) return error(404, 'Recording not found.');
    return new Response(null, { status: 302, headers: { ...NO_STORE, location: signed.signedUrl } });
  } catch (cause) {
    console.error('[week-speaking-take] playback failed:', cause);
    return error(500, 'Unable to load recording.');
  }
}

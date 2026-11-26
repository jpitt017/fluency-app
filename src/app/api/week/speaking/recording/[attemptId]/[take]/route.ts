import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';
import { createAdminSupabase } from '@/utils/supabase/admin';
import {
  createWeekSpeakingSignedUrl,
  parseWeekSpeakingRecordingPath,
} from '@/lib/b1b2/week-speaking-recordings.mjs';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'private, no-store, max-age=0' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function error(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

/**
 * A page-facing playback URL, not a Storage URL. Each request authenticates the
 * viewer, resolves exactly one saved owner-prefixed key, and redirects to a
 * fresh 60-second signed link. The redirect is no-store so a browser asks for
 * a new link after the old one expires.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attemptId: string; take: string }> },
) {
  try {
    const { attemptId, take } = await params;
    if (!UUID.test(attemptId) || (take !== '1' && take !== '2')) {
      return error(404, 'Recording not found.');
    }

    const supabase = await createServerSupabase();
    if (!supabase) return error(503, 'Playback is temporarily unavailable.');

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return error(401, 'Sign in required.');

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    const isStaff = profile?.role === 'teacher' || profile?.role === 'admin';

    // Staff may read any learner; the admin client keeps this working on a
    // project where 0062 has not been applied yet. If it is unavailable, fall
    // back to the authenticated client and its staff RLS policy. Learners
    // always use their own authenticated client, so RLS is the final gate.
    const readClient = isStaff ? (createAdminSupabase() ?? supabase) : supabase;
    const { data: attempt, error: attemptError } = isStaff
      ? await readClient
        .from('week_speaking_attempts')
        .select('id,user_id,week_number,first_recording_path,second_recording_path')
        .eq('id', attemptId)
        .maybeSingle()
      : await readClient
        .from('week_speaking_attempts')
        .select('id,user_id,week_number,first_recording_path,second_recording_path')
        .eq('id', attemptId)
        .eq('user_id', user.id)
        .maybeSingle();

    if (attemptError || !attempt) return error(404, 'Recording not found.');
    const path = take === '1' ? attempt.first_recording_path : attempt.second_recording_path;
    const parsed = parseWeekSpeakingRecordingPath(path);
    if (!parsed
      || parsed.userId !== attempt.user_id
      || parsed.attemptId !== attempt.id
      || parsed.weekNumber !== Number(attempt.week_number)
      || parsed.takeNumber !== Number(take)) {
      return error(404, 'Recording not found.');
    }

    const signed = await createWeekSpeakingSignedUrl(readClient, path);
    if (!signed.signedUrl) return error(404, 'Recording not found.');

    return new Response(null, {
      status: 302,
      headers: {
        ...NO_STORE,
        location: signed.signedUrl,
      },
    });
  } catch (cause) {
    console.error('[week-speaking-recording] playback failed:', cause);
    return error(500, 'Unable to load recording.');
  }
}

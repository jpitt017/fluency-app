import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';
import { isReportablePlay, isTrialWeek } from '@/lib/curriculum/listening-audio';

/**
 * Records how many times a learner has played a week's listening track.
 *
 * The count is a teaching signal, not access control. There is no limit any more:
 * playback never depends on this route succeeding, and a failure here must never
 * interrupt listening. The player sends the count it keeps in the browser, so the
 * value is untrusted — it is clamped and range-checked, and the week must be one
 * of the four that has a track.
 *
 * Written to the server log, which is where staff-facing detail belongs (see
 * AGENTS.md). No migration: this deliberately does not store anything yet, so
 * nothing here can block the player. `listening_play` is a stable, greppable tag.
 */
export async function POST(request: Request) {
  const client = await createServerSupabase();
  const user = client ? (await client.auth.getUser()).data.user : null;
  // A signed-out learner may still play the public track; there is just nobody
  // to attribute it to. Answer 204 rather than 401 so the player never shows an
  // error for a signal nobody can act on.
  if (!client || !user) return new NextResponse(null, { status: 204 });

  const body = (await request.json().catch(() => null)) as { week?: unknown; count?: unknown } | null;
  if (!body || !isReportablePlay(body.week, body.count)) {
    return NextResponse.json({ error: 'Please check that request.' }, { status: 400 });
  }

  const week = body.week as number;
  if (!isTrialWeek(week)) return NextResponse.json({ error: 'This track does not exist.' }, { status: 400 });

  // Logged, not stored. A user id and a count, no learner text.
  console.info('[listening_play]', JSON.stringify({ userId: user.id, week, count: body.count }));

  return new NextResponse(null, { status: 204 });
}

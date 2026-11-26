import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';

/** Return the signed-in learner's AI usage only when the usage panel is opened. */
export async function GET() {
  const client = await createServerSupabase();
  const user = client ? (await client.auth.getUser()).data.user : null;
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!client || !user) return NextResponse.json({ error: 'Sign in to check AI practice.' }, { status: 401, headers });

  const { data, error } = await client.rpc('get_ai_usage_status');
  if (error || !data || !Number.isInteger(data.daily_unit_limit) || !Number.isInteger(data.daily_units_remaining)) {
    return NextResponse.json({ error: 'We cannot show AI practice right now.' }, { status: 503, headers });
  }
  return NextResponse.json({
    daily_unit_limit: data.daily_unit_limit,
    daily_units_remaining: data.daily_units_remaining,
  }, { headers });
}

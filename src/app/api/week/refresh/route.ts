import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';

/** Explicit page-visit refresh. It is never invoked during an RSC prefetch. */
export async function POST() {
  const client = await createServerSupabase();
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!client || !user) {
    return NextResponse.json({ error: 'Sign in to refresh progress.' }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const { data, error } = await client.rpc('refresh_current_week');
  if (error || !Number.isInteger(data)) {
    console.error('[week] Could not refresh visit progress:', error?.message ?? 'invalid response');
    return NextResponse.json({ error: 'Could not refresh progress.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return NextResponse.json({ currentWeek: data }, { headers: { 'Cache-Control': 'no-store' } });
}

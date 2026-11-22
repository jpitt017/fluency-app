import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  const client = await createServerSupabase();
  if (!client) return NextResponse.json({ error: 'Service is not available.' }, { status: 503 });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.userId) || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Invalid learner or pilot setting.' }, { status: 400 });
  }
  const { error } = await client.rpc('teacher_set_pilot', { p_user_id: body.userId, p_enabled: body.enabled });
  if (error) {
    return NextResponse.json({ error: error.code === '42501' ? 'Teacher access required.' : 'Could not update pilot access.' }, { status: error.code === '42501' ? 403 : 400 });
  }
  return NextResponse.json({ ok: true });
}

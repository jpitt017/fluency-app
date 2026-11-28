import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';
import { DELETION_TARGET_EPOCH_HEADER } from '@/lib/b1b2/deletion-epoch.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const client = await createServerSupabase();
  if (!client) return NextResponse.json({ error: 'Service is not available.' }, { status: 503 });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.userId !== 'string' || !UUID.test(body.userId) || typeof body.enabled !== 'boolean'
      || (body.deletionGeneration != null && (typeof body.deletionGeneration !== 'string' || !UUID.test(body.deletionGeneration)))) {
    return NextResponse.json({ error: 'Invalid learner or pilot setting.' }, { status: 400 });
  }
  const update = client.rpc('teacher_set_pilot', { p_user_id: body.userId, p_enabled: body.enabled });
  // Optional on 0080 and while the compatibility flag is off. Once fenced,
  // 0081 requires the target generation from the roster for deleted accounts.
  if (body.deletionGeneration) update.setHeader(DELETION_TARGET_EPOCH_HEADER, body.deletionGeneration);
  const { error } = await update;
  if (error) {
    return NextResponse.json({ error: error.code === '42501' ? 'Teacher access required.'
      : error.code === 'P0001' ? 'This learner’s data changed. Refresh the roster and try again.'
        : 'Could not update pilot access.' }, { status: error.code === '42501' ? 403 : error.code === 'P0001' ? 409 : 400 });
  }
  return NextResponse.json({ ok: true });
}

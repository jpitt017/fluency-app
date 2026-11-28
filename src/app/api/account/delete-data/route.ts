import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { beginOrResumeDeletion, DeletionProblem, finishDeletion } from '@/lib/b1b2/retryable-data-deletion.mjs';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { createServerSupabase } from '@/utils/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { 'cache-control': 'private, no-store' };

// A receipt proves that the durable job was recorded before a file was
// touched. It contains no learner data and is scoped to the authenticated user.
function signature(userId: string, jobId: string, secret: string) {
  return createHmac('sha256', secret).update(`learning-data-deletion\0${userId}\0${jobId}`).digest('base64url');
}
function verifyReceipt(value: unknown, userId: string, secret: string) {
  if (typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 2 || !UUID.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return null;
  const expected = Buffer.from(signature(userId, parts[0], secret));
  const supplied = Buffer.from(parts[1]);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? parts[0] : null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) return NextResponse.json({ error: 'Data deletion is temporarily unavailable.' }, { status: 503, headers: NO_STORE });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401, headers: NO_STORE });
    const body = (await request.json().catch(() => ({}))) as { confirm?: string; phase?: string; receipt?: string };
    if (body.confirm !== 'DELETE') return NextResponse.json({ error: 'Please type DELETE to confirm.' }, { status: 400, headers: NO_STORE });
    if (body.phase && body.phase !== 'begin' && body.phase !== 'finish') {
      return NextResponse.json({ error: 'Please start deletion again.' }, { status: 400, headers: NO_STORE });
    }
    const admin = createAdminSupabase();
    const secret = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!admin || !secret) return NextResponse.json({ error: 'Data deletion is temporarily unavailable.' }, { status: 503, headers: NO_STORE });

    if (body.phase === 'finish') {
      const jobId = verifyReceipt(body.receipt, user.id, secret);
      if (!jobId) return NextResponse.json({ error: 'This saved request could not be verified. Please start again.', code: 'stale_receipt' }, { status: 400, headers: NO_STORE });
      const result = await finishDeletion(admin, user.id, jobId);
      return NextResponse.json(result, { headers: NO_STORE });
    }

    if (!body.phase) {
      // Pre-0081 browsers have no durable receipt, so an ambiguous response
      // cannot be distinguished from a new request. Preserve them in the
      // overlap, then ask an obsolete page to refresh after the reviewed fence
      // is activated. An old schema has no config table and keeps old behavior.
      const config = await admin.from('data_deletion_safety_config').select('enforce_legacy_fence').eq('singleton', true).maybeSingle();
      if ((config.error && !['42P01', 'PGRST205'].includes(config.error.code))
        || (!config.error && typeof config.data?.enforce_legacy_fence !== 'boolean')) {
        return NextResponse.json({ error: 'Data deletion is temporarily unavailable.' }, { status: 503, headers: NO_STORE });
      }
      if (config.data?.enforce_legacy_fence) {
        return NextResponse.json({ error: 'Please refresh this page before deleting your data.' }, { status: 409, headers: NO_STORE });
      }
    }
    const jobId = await beginOrResumeDeletion(admin, user.id);
    const receipt = `${jobId}.${signature(user.id, jobId, secret)}`;
    if (body.phase === 'begin') return NextResponse.json({ pending: true, receipt }, { headers: NO_STORE });
    // Older browsers send only {confirm:'DELETE'}. They can still start or
    // resume the same job while the newer two-step client preserves a receipt
    // across ambiguous responses and page reloads.
    const result = await finishDeletion(admin, user.id, jobId);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error: unknown) {
    if (error instanceof DeletionProblem) {
      return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status, headers: NO_STORE });
    }
    console.error('[delete-data] request failed:', error);
    return NextResponse.json({ error: 'We could not finish deleting your data. Please try again.' }, { status: 500, headers: NO_STORE });
  }
}

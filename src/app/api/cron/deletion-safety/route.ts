import { NextRequest, NextResponse } from 'next/server';
import { sweepLateDeletionFiles } from '@/lib/b1b2/sweep-late-deletion-files.mjs';
import { createAdminSupabase } from '@/utils/supabase/admin';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Service unavailable.' }, { status: 503 });
  let progress = { examined: 0, removed: 0 };
  try {
    // A destructive sweep is enabled only as an explicit rollout step after
    // the owner has reviewed the overlap candidates and old instances retire.
    const config = await admin.from('data_deletion_safety_config').select('sweep_enabled').eq('singleton', true).maybeSingle();
    if (config.error) {
      if (['42P01', 'PGRST205'].includes(config.error.code)) {
        console.info('[deletion-safety] sweep unavailable on old schema', { examined: 0, removed: 0 });
        return NextResponse.json({ ok: true, skipped: 'old-schema', examined: 0, removed: 0 });
      }
      throw new Error('Deletion safety settings unavailable');
    }
    if (typeof config.data?.sweep_enabled !== 'boolean') throw new Error('Deletion safety settings unavailable');
    if (!config.data.sweep_enabled) {
      console.info('[deletion-safety] sweep not activated', { examined: 0, removed: 0 });
      return NextResponse.json({ ok: true, skipped: 'not-enabled', examined: 0, removed: 0 });
    }
    const result = await sweepLateDeletionFiles(admin, {
      maxBatches: 50,
      onProgress: (counts: { examined: number; removed: number }) => { progress = counts; },
    });
    // Counts only: never log user IDs, object keys, email addresses or audio.
    console.info('[deletion-safety] daily sweep', result);
    return NextResponse.json({ ok: !result.hasMore, ...result }, { status: result.hasMore ? 503 : 200 });
  } catch {
    // Only confirmed removals are counted: a failed Storage response may have
    // removed additional files, so the next run must re-list rather than guess.
    console.error('[deletion-safety] daily sweep incomplete', { examined: progress.examined, confirmedRemoved: progress.removed });
    return NextResponse.json({ error: 'Cleanup incomplete; it will be retried.' }, { status: 503 });
  }
}

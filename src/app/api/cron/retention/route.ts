import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const RECORDING_BUCKET = 'speaking-recordings';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase service credentials are not configured.' }, { status: 503 });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data, error } = await admin.rpc('cleanup_expired_retention_data');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const payload = (data ?? {}) as {
    cache_deleted?: number;
    logs_deleted?: number;
    usage_deleted?: number;
    expired_audio_paths?: string[];
  };

  const audioPaths = Array.isArray(payload.expired_audio_paths)
    ? payload.expired_audio_paths.filter((p): p is string => typeof p === 'string' && p.length > 0)
    : [];

  let storageRemoved = 0;
  if (audioPaths.length > 0) {
    const { data: removed } = await admin.storage.from(RECORDING_BUCKET).remove(audioPaths);
    storageRemoved = removed?.length ?? audioPaths.length;
  }

  return NextResponse.json({
    ok: true,
    cacheDeleted: payload.cache_deleted ?? 0,
    logsDeleted: payload.logs_deleted ?? 0,
    usageDeleted: payload.usage_deleted ?? 0,
    storageFilesRemoved: storageRemoved,
  });
}

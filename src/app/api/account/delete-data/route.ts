import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase/server';

const RECORDING_BUCKET = 'speaking-recordings';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Database client is not configured.' }, { status: 503 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { confirm?: string };
    if (body.confirm !== 'DELETE') {
      return NextResponse.json(
        { error: 'Pass { "confirm": "DELETE" } to permanently erase your learning data.' },
        { status: 400 },
      );
    }

    const { data: rpcResult, error: rpcErr } = await supabase.rpc('delete_my_learning_data');
    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    }

    const paths = new Set<string>(
      Array.isArray((rpcResult as { audio_paths?: unknown } | null)?.audio_paths)
        ? ((rpcResult as { audio_paths: string[] }).audio_paths ?? [])
        : [],
    );

    // Also scan user's prefix in speaking-recordings so no orphan audio files remain
    const { data: listed } = await supabase.storage.from(RECORDING_BUCKET).list(user.id, { limit: 200 });
    for (const item of listed ?? []) {
      if (item.name) {
        paths.add(`${user.id}/${item.name}`);
      }
    }

    const allPaths = Array.from(paths).filter(Boolean);
    if (allPaths.length > 0) {
      await supabase.storage.from(RECORDING_BUCKET).remove(allPaths);
    }

    return NextResponse.json({
      deleted: true,
      removedAudioFiles: allPaths.length,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not delete learning data.' },
      { status: 500 },
    );
  }
}

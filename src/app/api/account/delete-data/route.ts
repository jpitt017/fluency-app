import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { createServerSupabase } from '@/utils/supabase/server';

const RECORDING_BUCKET = 'speaking-recordings';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) {
      console.error('[delete-data] database client is not configured');
      return NextResponse.json({ error: 'We could not delete your data. Please try again.' }, { status: 503 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { confirm?: string };
    if (body.confirm !== 'DELETE') {
      return NextResponse.json({ error: 'Please type DELETE to confirm.' }, { status: 400 });
    }

    const admin = createAdminSupabase();
    if (!admin) return NextResponse.json({ error: 'Data deletion is temporarily unavailable.' }, { status: 503 });
    const ownedPrefix = `${user.id}/`;
    const isOwnedPath = (path: unknown): path is string => typeof path === 'string' &&
      path.startsWith(ownedPrefix) && path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');

    // Read exact object keys from their owner-scoped rows before the deletion
    // RPC removes those rows. A full-prefix scan invokes Storage search and is
    // unnecessary when every upload is already recorded in the database.
    const [reportFiles, speakingFiles, weekSpeakingFiles] = await Promise.all([
      admin.from('issue_reports').select('audio_path,screenshot_path').eq('user_id', user.id),
      admin.from('speaking_attempts').select('audio_path').eq('user_id', user.id),
      admin.from('week_speaking_attempts').select('first_recording_path,second_recording_path').eq('user_id', user.id),
    ]);
    if (reportFiles.error || speakingFiles.error || weekSpeakingFiles.error) {
      return NextResponse.json({ error: 'Could not find your stored files.' }, { status: 503 });
    }

    const issuePaths = Array.from(new Set((reportFiles.data ?? [])
      .flatMap((row) => [row.audio_path, row.screenshot_path])
      .filter(isOwnedPath)));
    const recordingPaths = Array.from(new Set([
      ...(speakingFiles.data ?? []).map((row) => row.audio_path),
      ...(weekSpeakingFiles.data ?? []).flatMap((row) => [row.first_recording_path, row.second_recording_path]),
    ].filter(isOwnedPath)));

    // Remove files before deleting their rows. If Storage fails, the rows remain
    // so the user can retry and the keys can be discovered again without scans.
    if (issuePaths.length) {
      const removed = await admin.storage.from('issue-attachments').remove(issuePaths);
      if (removed.error) return NextResponse.json({ error: 'Could not delete report files.' }, { status: 503 });
    }
    let removedAudioFiles = 0;
    if (recordingPaths.length) {
      const removed = await admin.storage.from(RECORDING_BUCKET).remove(recordingPaths);
      if (removed.error) return NextResponse.json({ error: 'Could not delete recording files.' }, { status: 503 });
      removedAudioFiles = removed.data?.length ?? 0;
    }

    const { error: weekDeleteError } = await supabase.from('week_output_submissions').delete().eq('user_id', user.id);
    if (weekDeleteError) {
      console.error('[delete-data] week submissions delete failed:', weekDeleteError);
      return NextResponse.json({ error: 'We could not delete your data. Please try again.' }, { status: 500 });
    }

    const { error: rpcErr } = await supabase.rpc('delete_my_learning_data');
    if (rpcErr) {
      console.error('[delete-data] delete_my_learning_data failed:', rpcErr);
      return NextResponse.json({ error: 'We could not delete your data. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ deleted: true, removedAudioFiles });
  } catch (err: unknown) {
    console.error('[delete-data] failed:', err);
    return NextResponse.json(
      { error: 'We could not delete your data. Please try again.' },
      { status: 500 },
    );
  }
}

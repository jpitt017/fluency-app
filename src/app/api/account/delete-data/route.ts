import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { createServerSupabase } from '@/utils/supabase/server';

const RECORDING_BUCKET = 'speaking-recordings';

export async function POST(request: NextRequest) {
  let deletionLock: { admin: NonNullable<ReturnType<typeof createAdminSupabase>>; userId: string; lockId: string } | null = null;
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
    // Prevent a new weekly upload between the object scan and row deletion.
    // In-flight uploads/checks must finish first; a failed delete releases the
    // token, and a crashed process has a bounded server-side lease.
    const lockId = crypto.randomUUID();
    const lock = await admin.rpc('begin_week_speaking_deletion', { p_user_id: user.id, p_lock_id: lockId });
    if (lock.error) return NextResponse.json({ error: 'Data deletion is temporarily unavailable.' }, { status: 503 });
    if (lock.data !== true) return NextResponse.json({ error: 'A recording is still being saved or checked. Please wait and try again.' }, { status: 409 });
    deletionLock = { admin, userId: user.id, lockId };
    const ownedPrefix = `${user.id}/`;
    const isOwnedPath = (path: unknown): path is string => typeof path === 'string' &&
      path.startsWith(ownedPrefix) && path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');

    // Read every exact owner-scoped key before rows are deleted. PostgREST
    // caps result pages, so use its exact count and advance by the rows actually
    // returned, even if the configured cap is smaller than our requested page.
    async function readOwned(table: string, columns: string) {
      const rows: Record<string, unknown>[] = [];
      while (true) {
        const page = await admin!.from(table).select(columns, { count: 'exact' }).eq('user_id', user!.id)
          .order('id', { ascending: true }).range(rows.length, rows.length + 499);
        if (page.error || page.count === null || !page.data) return { data: rows, error: page.error ?? new Error('Missing row count') };
        const found = page.data as unknown as Record<string, unknown>[];
        rows.push(...found);
        if (rows.length >= page.count) return { data: rows, error: null };
        if (!found.length) return { data: rows, error: new Error('Incomplete row page') };
      }
    }
    const [reportFiles, speakingFiles, weekSpeakingFiles, weekTakes] = await Promise.all([
      readOwned('issue_reports', 'audio_path,screenshot_path'),
      readOwned('speaking_attempts', 'audio_path'),
      readOwned('week_speaking_attempts', 'first_recording_path,second_recording_path'),
      readOwned('week_speaking_takes', 'recording_path'),
    ]);
    if (reportFiles.error || speakingFiles.error || weekSpeakingFiles.error || weekTakes.error) {
      return NextResponse.json({ error: 'Could not find your stored files.' }, { status: 503 });
    }

    const issuePaths = Array.from(new Set((reportFiles.data ?? [])
      .flatMap((row) => [row.audio_path, row.screenshot_path])
      .filter(isOwnedPath)));
    const recordingPaths = Array.from(new Set([
      ...(speakingFiles.data ?? []).map((row) => row.audio_path),
      ...(weekSpeakingFiles.data ?? []).flatMap((row) => [row.first_recording_path, row.second_recording_path]),
      ...(weekTakes.data ?? []).map((row) => row.recording_path),
    ].filter(isOwnedPath)));

    // Remove files before deleting their rows. If a batch fails, all keys stay
    // in the ledger so the learner can safely retry, including missing objects.
    async function removeFiles(bucket: string, paths: string[]) {
      let count = 0;
      for (let start = 0; start < paths.length; start += 100) {
        const removed = await admin!.storage.from(bucket).remove(paths.slice(start, start + 100));
        if (removed.error) return { count, error: removed.error };
        count += removed.data?.length ?? 0;
      }
      return { count, error: null };
    }
    const removedIssues = await removeFiles('issue-attachments', issuePaths);
    if (removedIssues.error) return NextResponse.json({ error: 'Could not delete report files.' }, { status: 503 });
    const removedAudio = await removeFiles(RECORDING_BUCKET, recordingPaths);
    if (removedAudio.error) return NextResponse.json({ error: 'Could not delete recording files.' }, { status: 503 });
    const removedAudioFiles = removedAudio.count;

    // This service-only wrapper verifies the same unexpired token under the
    // database lock and sets auth.uid() for the existing deletion function.
    // A stale request cannot delete rows after a new capture has started.
    const { data: deletion, error: rpcErr } = await admin.rpc('finish_week_speaking_deletion', { p_user_id: user.id, p_lock_id: lockId });
    if (rpcErr || deletion?.deleted !== true) {
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
  } finally {
    if (deletionLock) {
      const { admin, userId, lockId } = deletionLock;
      try { await admin.rpc('end_week_speaking_deletion', { p_user_id: userId, p_lock_id: lockId }); }
      catch (error) { console.error('[delete-data] lock release failed:', error); }
    }
  }
}

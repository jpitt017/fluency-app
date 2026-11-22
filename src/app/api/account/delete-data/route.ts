import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { createServerSupabase } from '@/utils/supabase/server';
import { clearUserStorage } from '@/lib/b1b2/delete-user-storage.mjs';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) return NextResponse.json({ error: 'Database client is not configured.' }, { status: 503 });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as { confirm?: string };
    if (body.confirm !== 'DELETE') return NextResponse.json({ error: 'Type DELETE to permanently erase your learning data.' }, { status: 400 });
    const admin = createAdminSupabase();
    if (!admin) return NextResponse.json({ error: 'Data deletion is temporarily unavailable.' }, { status: 503 });

    // Fail closed before deleting database paths: retries can still find remaining files.
    const removedAudioFiles = await clearUserStorage(admin.storage, 'speaking-recordings', user.id);
    await clearUserStorage(admin.storage, 'issue-attachments', user.id);
    const { error } = await supabase.rpc('delete_my_learning_data');
    if (error) throw error;
    return NextResponse.json({ deleted: true, removedAudioFiles });
  } catch (error) {
    console.error('[delete-data] deletion failed', error);
    return NextResponse.json({ error: 'Could not delete all learning data. Please try again.' }, { status: 503 });
  }
}

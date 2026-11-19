import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function GET(_request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  try {
    const { attemptId } = await params;
    const cookieStore = await cookies();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (items) => { try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Read-only request context */ } },
      },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: attempt, error } = await supabase.from('cefr_checkpoint_attempts').select('recording_url').eq('id', attemptId).eq('user_id', user.id).single();
    if (error || !attempt?.recording_url || !attempt.recording_url.startsWith(`${user.id}/`)) return NextResponse.json({ error: 'Recording not found.' }, { status: 404 });
    const { data: signed, error: signError } = await supabase.storage.from('checkpoint-recordings').createSignedUrl(attempt.recording_url, 60);
    if (signError || !signed?.signedUrl) return NextResponse.json({ error: 'Unable to access recording.' }, { status: 404 });
    return NextResponse.redirect(signed.signedUrl);
  } catch {
    return NextResponse.json({ error: 'Unable to load recording.' }, { status: 500 });
  }
}

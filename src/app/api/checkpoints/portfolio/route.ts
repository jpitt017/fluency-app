import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
    const cookieStore = await cookies();
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (items) => {
          try {
            items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            /* Read-only request context */
          }
        },
      },
    });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [speakingRes, writingRes] = await Promise.all([
      supabase
        .from('speaking_attempts')
        .select('id, transcript, overall, feedback, audio_path, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(25),
      supabase
        .from('writing_submissions')
        .select('id, body, word_count, overall, feedback, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

    if (speakingRes.error) throw speakingRes.error;
    if (writingRes.error) throw writingRes.error;

    return NextResponse.json({
      speaking: speakingRes.data ?? [],
      writing: writingRes.data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load portfolio.' },
      { status: 500 },
    );
  }
}

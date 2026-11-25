import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      console.error('[portfolio] database client is not configured');
      return NextResponse.json({ error: 'We could not load your work. Please try again.' }, { status: 503 });
    }
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
    if (authError || !user) {
      if (authError) console.error('[portfolio] Could not authenticate:', authError);
      return NextResponse.json({ error: 'Sign in to see your work.' }, { status: 401 });
    }

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
    console.error('[portfolio] Could not load work:', error);
    return NextResponse.json({ error: 'We could not load your work. Please try again.' }, { status: 500 });
  }
}

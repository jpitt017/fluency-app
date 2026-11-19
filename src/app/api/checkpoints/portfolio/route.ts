import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
    const cookieStore = await cookies();
    const supabase = createServerClient(url, key, { cookies: { getAll: () => cookieStore.getAll(), setAll: (items) => { try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Read-only request context */ } } } });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data, error } = await supabase.from('cefr_checkpoint_attempts').select('id,module_number,objective_id,transcript,writing_sample,passed,rubric,recording_url,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return NextResponse.json({ submissions: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load portfolio.' }, { status: 500 });
  }
}

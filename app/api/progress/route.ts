import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { sessionId, completed } = await req.json();
    const userId = 'default_learner'; // Replace with auth.users ID when Supabase Auth is integrated

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required.' }, { status: 400 });
    }

    if (completed) {
      const { error } = await supabase
        .schema('course')
        .from('user_progress')
        .upsert({ user_id: userId, session_id: sessionId, completed: true, completed_at: new Date().toISOString() }, { onConflict: 'user_id,session_id' });

      if (error) throw error;
    } else {
      const { error } = await supabase
        .schema('course')
        .from('user_progress')
        .delete()
        .match({ user_id: userId, session_id: sessionId });

      if (error) throw error;
    }

    return NextResponse.json({ success: true, completed });
  } catch (err: any) {
    console.error('Error updating progress:', err);
    return NextResponse.json({ error: err.message || 'Failed to update progress.' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ completed: false });
  }

  const { data } = await supabase
    .schema('course')
    .from('user_progress')
    .select('completed')
    .eq('user_id', 'default_learner')
    .eq('session_id', sessionId)
    .maybeSingle();

  return NextResponse.json({ completed: !!data?.completed });
}
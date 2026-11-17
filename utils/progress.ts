import { createClient } from '@/utils/supabase/client';

export async function logStudentProgress(sessionId: string, score: number) {
  const supabase = createClient();
  
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('User not authenticated.');

    const { error } = await supabase.from('progress_logs').insert({
      user_id: user.id,
      session_id: sessionId,
      score: score,
    });

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error('Failed to log student progress:', err.message);
    return { success: false, error: err.message };
  }
}
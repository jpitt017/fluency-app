import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/utils/supabase/server';

export interface TeacherViewer {
  id: string;
  role: 'teacher' | 'admin';
}

/**
 * Server-side gate for authoring and assessment documents.
 *
 * Fails closed: no Supabase configuration or no verified teacher/admin profile
 * sends the visitor to login (signed out) or the learner dashboard (signed in).
 */
export async function requireTeacherViewer(): Promise<TeacherViewer> {
  const supabase = await createServerSupabase();
  if (!supabase) redirect('/login');

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = profile?.role;
  if (role !== 'teacher' && role !== 'admin') redirect('/dashboard');

  return { id: user.id, role };
}

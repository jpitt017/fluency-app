import { createServerSupabase } from '@/utils/supabase/server';
import type { CurriculumOutline, LessonPayload } from './types';

export async function loadLesson(lessonNumber: number): Promise<LessonPayload | null> {
  if (!Number.isInteger(lessonNumber) || lessonNumber < 1 || lessonNumber > 64) return null;

  const supabase = await createServerSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('get_lesson', { p_lesson_number: lessonNumber });
  if (error) {
    console.error('get_lesson failed:', error.message);
    return null;
  }

  return (data as LessonPayload | null) ?? null;
}

export async function loadOutline(): Promise<CurriculumOutline | null> {
  const supabase = await createServerSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('get_curriculum_outline');
  if (error) {
    console.error('get_curriculum_outline failed:', error.message);
    return null;
  }

  return (data as CurriculumOutline | null) ?? null;
}

export async function getViewer() {
  const supabase = await createServerSupabase();
  if (!supabase) return { user: null, signedIn: false };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user, signedIn: Boolean(user) };
}

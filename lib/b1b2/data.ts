import { createServerSupabase } from '@/utils/supabase/server';
import type {
  BadgeRow,
  CheckpointPayload,
  CurriculumOutline,
  LearnerDashboard,
  LessonPayload,
  WeeklyReport,
} from './types';

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

export async function loadCheckpoint(code: string): Promise<CheckpointPayload | null> {
  if (!/^[a-z0-9_]{3,48}$/.test(code)) return null;

  const supabase = await createServerSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('get_checkpoint', { p_code: code });
  if (error) {
    console.error('get_checkpoint failed:', error.message);
    return null;
  }

  return (data as CheckpointPayload | null) ?? null;
}

export async function loadDashboard(): Promise<{
  dashboard: LearnerDashboard | null;
  weekly: WeeklyReport | null;
  badges: BadgeRow[];
}> {
  const supabase = await createServerSupabase();
  if (!supabase) return { dashboard: null, weekly: null, badges: [] };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { dashboard: null, weekly: null, badges: [] };

  const [dashboardResult, weeklyResult, catalogResult, earnedResult] = await Promise.all([
    supabase.rpc('get_learner_dashboard'),
    supabase.from('weekly_reports').select('*').order('week_start', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('badges').select('id, code, title, description, icon, xp_reward').order('xp_reward'),
    supabase.from('user_badges').select('badge_id, earned_at'),
  ]);

  const earned = new Map<string, string>(
    (earnedResult.data ?? []).map((row) => [row.badge_id as string, row.earned_at as string]),
  );

  const badges: BadgeRow[] = (catalogResult.data ?? []).map((badge) => ({
    ...(badge as BadgeRow),
    earned_at: earned.get(badge.id as string) ?? null,
  }));

  return {
    dashboard: (dashboardResult.data as LearnerDashboard | null) ?? null,
    weekly: (weeklyResult.data as WeeklyReport | null) ?? null,
    badges,
  };
}

export async function getViewer() {
  const supabase = await createServerSupabase();
  if (!supabase) return { user: null, signedIn: false };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user, signedIn: Boolean(user) };
}

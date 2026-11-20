import { createServerSupabase } from '@/utils/supabase/server';
import type {
  CheckpointDetail,
  ContentInput,
  CurriculumOutline,
  DashboardPayload,
  HeaderSummary,
  LearnerBand,
  LessonPayload,
  OutlineCheckpoint,
  PracticeItem,
  SkillArea,
  SpeakingTask,
  VocabDeckSummary,
  WeeklyReportRow,
  WritingTask,
  XpEventRow,
} from './types';

export const BAND_LABELS: Record<LearnerBand, string> = {
  B1_low: 'B1 Low',
  B1_mid: 'B1 Mid',
  B1_high: 'B1 High',
  B1_plus: 'B1+',
  B2_entry: 'B2 Entry',
  B2_developing: 'B2 Developing',
  B2_solid: 'B2 Solid',
};

export function formatBandLabel(band?: string | null): string {
  if (!band) return 'B1 Low';
  return BAND_LABELS[band as LearnerBand] ?? band.replace(/_/g, ' ');
}

function dedupeCheckpoints(checkpoints: OutlineCheckpoint[]): OutlineCheckpoint[] {
  const byCode = new Map<string, OutlineCheckpoint>();
  for (const cp of checkpoints) {
    const existing = byCode.get(cp.code);
    const cpDone = cp.status === 'completed' || (cp.status as string) === 'evaluated';
    const existingDone = existing && (existing.status === 'completed' || (existing.status as string) === 'evaluated');
    if (!existing || (cpDone && !existingDone)) {
      byCode.set(cp.code, {
        ...cp,
        status: cpDone ? 'completed' : cp.status,
      });
    }
  }
  return Array.from(byCode.values());
}

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

  const outline = (data as CurriculumOutline | null) ?? null;
  if (outline?.checkpoints) {
    outline.checkpoints = dedupeCheckpoints(outline.checkpoints);
  }
  return outline;
}

export async function getViewer() {
  const supabase = await createServerSupabase();
  if (!supabase) return { user: null, signedIn: false };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user, signedIn: Boolean(user) };
}

export async function loadDashboard(): Promise<{
  signedIn: boolean;
  dashboard: DashboardPayload | null;
  recentXp: XpEventRow[];
  weeklyGoalHours: number;
  weeklyReport: WeeklyReportRow | null;
  subscriptionStatus: string | null;
}> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return {
      signedIn: false,
      dashboard: null,
      recentXp: [],
      weeklyGoalHours: 8,
      weeklyReport: null,
      subscriptionStatus: null,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      signedIn: false,
      dashboard: null,
      recentXp: [],
      weeklyGoalHours: 8,
      weeklyReport: null,
      subscriptionStatus: null,
    };
  }

  const [dashRes, xpRes, prefRes, subRes, reportRes] = await Promise.all([
    supabase.rpc('get_learner_dashboard'),
    supabase
      .from('xp_events')
      .select('id, source, points, note, created_at')
      .order('created_at', { ascending: false })
      .limit(6),
    supabase.from('curriculum_preferences').select('target_hours_per_week').maybeSingle(),
    supabase.from('profiles').select('subscription_status').eq('id', user.id).maybeSingle(),
    supabase
      .from('weekly_reports')
      .select('id, week_start, study_minutes, words_learned, recordings, writing_tasks, weakest_skill, payload')
      .eq('user_id', user.id)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (dashRes.error) {
    console.error('get_learner_dashboard failed:', dashRes.error.message);
  }

  return {
    signedIn: true,
    dashboard: (dashRes.data as DashboardPayload | null) ?? null,
    recentXp: (xpRes.data as XpEventRow[] | null) ?? [],
    weeklyGoalHours: Number(prefRes.data?.target_hours_per_week ?? 8),
    weeklyReport: (reportRes.data as WeeklyReportRow | null) ?? null,
    subscriptionStatus: subRes.data?.subscription_status ?? null,
  };
}

export async function loadHeaderSummary(): Promise<HeaderSummary> {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) {
      return { signedIn: false, xpTotal: 0, streakDays: 0, band: 'B1_low', lessonsCompleted: 0 };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { signedIn: false, xpTotal: 0, streakDays: 0, band: 'B1_low', lessonsCompleted: 0 };
    }

    const [profileRes, completedRes] = await Promise.all([
      supabase.from('profiles').select('xp_total, streak_days, learner_band').eq('id', user.id).maybeSingle(),
      supabase
        .from('lesson_progress')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'completed'),
    ]);

    return {
      signedIn: true,
      xpTotal: profileRes.data?.xp_total ?? 0,
      streakDays: profileRes.data?.streak_days ?? 0,
      band: (profileRes.data?.learner_band as LearnerBand | undefined) ?? 'B1_low',
      lessonsCompleted: completedRes.count ?? 0,
    };
  } catch {
    return { signedIn: false, xpTotal: 0, streakDays: 0, band: 'B1_low', lessonsCompleted: 0 };
  }
}

export async function loadVocabDecks(): Promise<{
  signedIn: boolean;
  decks: VocabDeckSummary[];
  dueCount: number;
  totalReviews: number;
}> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return { signedIn: false, decks: [], dueCount: 0, totalReviews: 0 };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [decksRes, itemsRes] = await Promise.all([
    supabase
      .from('vocab_decks')
      .select('id, slug, title, topic, description, daily_target, modules(module_number)')
      .order('slug'),
    supabase
      .from('vocab_items')
      .select('id, deck_id, term, part_of_speech, ipa, definition, example, collocations, translation_es, band')
      .order('term'),
  ]);

  const itemsByDeck = new Map<string, VocabDeckSummary['items']>();
  for (const row of itemsRes.data ?? []) {
    const list = itemsByDeck.get(row.deck_id) ?? [];
    list.push({
      id: row.id,
      term: row.term,
      part_of_speech: row.part_of_speech,
      ipa: row.ipa,
      definition: row.definition,
      example: row.example,
      collocations: row.collocations ?? [],
      translation_es: row.translation_es,
      band: row.band,
    });
    itemsByDeck.set(row.deck_id, list);
  }

  const decks: VocabDeckSummary[] = (decksRes.data ?? []).map((deck) => {
    const modRel = deck.modules as { module_number?: number } | { module_number?: number }[] | null;
    const modNum = Array.isArray(modRel) ? modRel[0]?.module_number ?? null : modRel?.module_number ?? null;
    return {
      id: deck.id,
      slug: deck.slug,
      title: deck.title,
      topic: deck.topic,
      description: deck.description,
      daily_target: deck.daily_target,
      module_number: modNum,
      items: itemsByDeck.get(deck.id) ?? [],
    };
  });

  if (!user) {
    return { signedIn: false, decks, dueCount: 0, totalReviews: 0 };
  }

  const [dueRes, reviewsRes] = await Promise.all([
    supabase
      .from('vocab_cards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('suspended', false)
      .lte('due_at', new Date().toISOString()),
    supabase.from('vocab_reviews').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ]);

  return {
    signedIn: true,
    decks,
    dueCount: dueRes.count ?? 0,
    totalReviews: reviewsRes.count ?? 0,
  };
}

export async function loadCheckpointDetail(code: string): Promise<{
  signedIn: boolean;
  checkpoint: CheckpointDetail | null;
}> {
  const supabase = await createServerSupabase();
  if (!supabase) return { signedIn: false, checkpoint: null };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: cp, error } = await supabase
    .from('checkpoints')
    .select('id, code, title, timing_label, description, duration_minutes, skills, tasks, module_id')
    .eq('code', code)
    .maybeSingle();

  if (error || !cp) {
    return { signedIn: Boolean(user), checkpoint: null };
  }

  const modId = cp.module_id;
  const [modRes, inputsRes, speakingRes, writingRes, lessonsRes, attemptRes] = await Promise.all([
    modId
      ? supabase
          .from('modules')
          .select('id, module_number, title, summary, grammar_focus, vocabulary_topic')
          .eq('id', modId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    modId
      ? supabase
          .from('content_inputs')
          .select('id, kind, title, source_label, accent, body, duration_seconds, word_count, questions')
          .eq('module_id', modId)
      : Promise.resolve({ data: [] }),
    modId
      ? supabase
          .from('speaking_tasks')
          .select('id, kind, title, prompt, target_seconds, useful_phrases, target_linkers, target_terms')
          .eq('module_id', modId)
          .order('target_seconds', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    modId
      ? supabase
          .from('writing_tasks')
          .select('id, title, prompt, format, word_min, word_max, outline')
          .eq('module_id', modId)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    modId
      ? supabase.from('lessons').select('id').eq('module_id', modId).order('module_lesson_number')
      : Promise.resolve({ data: [] }),
    user
      ? supabase
          .from('checkpoint_attempts')
          .select('id, status, scores, result, completed_at')
          .eq('user_id', user.id)
          .eq('checkpoint_id', cp.id)
          .order('completed_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let practiceItems: PracticeItem[] = [];
  const lessonIds = (lessonsRes.data ?? []).map((l) => l.id);
  if (user && lessonIds.length > 0) {
    const { data: pItems } = await supabase
      .from('practice_items')
      .select('id, kind, sort_order, prompt, options, answer, explanation, difficulty')
      .in('lesson_id', lessonIds)
      .lte('sort_order', 2)
      .limit(12);
    practiceItems = (pItems as PracticeItem[] | null) ?? [];
  }

  return {
    signedIn: Boolean(user),
    checkpoint: {
      id: cp.id,
      code: cp.code,
      title: cp.title,
      timing_label: cp.timing_label,
      description: cp.description,
      duration_minutes: cp.duration_minutes,
      skills: (cp.skills as SkillArea[]) ?? [],
      tasks: (cp.tasks as CheckpointDetail['tasks']) ?? [],
      module: modRes.data ?? null,
      inputs: (inputsRes.data as ContentInput[] | null) ?? [],
      practiceItems,
      speakingTask: (speakingRes.data as SpeakingTask | null) ?? null,
      writingTask: (writingRes.data as WritingTask | null) ?? null,
      latestAttempt: attemptRes.data ?? null,
    },
  };
}

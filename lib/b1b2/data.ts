import { createServerSupabase } from '@/utils/supabase/server';
import { ERROR_CATEGORY_LABELS } from './feedback-schema';
import type {
  AiObservabilitySummary,
  DashboardPayload,
  DashboardSkillTelemetry,
  ErrorReviewCardRow,
  HeaderSummary,
  LearnerBand,
  PlacementQuestionRow,
  RecurringErrorTag,
  TeacherRosterLearner,
  WeeklyReportRow,
  XpEventRow,
} from './types';

const ERROR_TAG_LABELS: Record<string, string> = {
  ...ERROR_CATEGORY_LABELS,
  articles: 'Articles (a / an / the)',
  prepositions: 'Prepositions & dependent prepositions',
  tense_aspect: 'Tense & aspect choices',
  collocations: 'Natural collocations',
  connectors: 'Discourse linkers & concession',
  pronunciation_stress: 'Word stress & connected speech',
};

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
  telemetry: DashboardSkillTelemetry;
}> {
  const emptyTelemetry: DashboardSkillTelemetry = {
    activeVocabMastered: 0,
    activeVocabTotal: 0,
    speakingCount: 0,
    speakingLatest: null,
    speakingDelta: null,
    writingCount: 0,
    writingLatest: null,
    writingDelta: null,
    recurringErrors: [],
    errorsPer100Words: null,
    errorsPer100WordsDelta: null,
    hasEnoughWordData: false,
    hasEnoughTrendData: false,
    minWordsRequired: 200,
    totalWordsEvaluated: 0,
    dueErrorCards: 0,
    masteredErrorCards: 0,
    missedPracticeCount: 0,
    placementRecommendation: null,
  };

  const supabase = await createServerSupabase();
  if (!supabase) {
    return {
      signedIn: false,
      dashboard: null,
      recentXp: [],
      weeklyGoalHours: 4,
      weeklyReport: null,
      subscriptionStatus: null,
      telemetry: emptyTelemetry,
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
      weeklyGoalHours: 4,
      weeklyReport: null,
      subscriptionStatus: null,
      telemetry: emptyTelemetry,
    };
  }

  const nowIso = new Date().toISOString();
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgoIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [
    dashRes,
    xpRes,
    prefRes,
    subRes,
    reportRes,
    vocabMasteredRes,
    vocabTotalRes,
    speakingRes,
    writingRes,
    missedRes,
    learnerErrorsRes,
    dueErrorCardsRes,
    masteredErrorCardsRes,
  ] = await Promise.all([
    supabase.rpc('get_learner_dashboard'),
    supabase
      .from('xp_events')
      .select('id, source, points, note, created_at')
      .order('created_at', { ascending: false })
      .limit(6),
    supabase.from('curriculum_preferences').select('target_hours_per_week').maybeSingle(),
    supabase.from('profiles').select('subscription_status, placement_result').eq('id', user.id).maybeSingle(),
    supabase
      .from('weekly_reports')
      .select('id, week_start, study_minutes, words_learned, recordings, writing_tasks, weakest_skill, payload')
      .eq('user_id', user.id)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('vocab_cards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('ladder_step', 3),
    supabase
      .from('vocab_cards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from('speaking_attempts')
      .select('overall, word_count, created_at, feedback')
      .eq('user_id', user.id)
      .eq('status', 'evaluated')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('writing_submissions')
      .select('overall, word_count, created_at, feedback')
      .eq('user_id', user.id)
      .eq('status', 'evaluated')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('practice_attempts')
      .select('item_id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_correct', false),
    supabase
      .from('learner_errors')
      .select('category, created_at, source_word_count')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('error_review_cards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('suspended', false)
      .eq('mastered', false)
      .lte('due_at', nowIso),
    supabase
      .from('error_review_cards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('mastered', true),
  ]);

  if (dashRes.error) {
    console.error('get_learner_dashboard failed:', dashRes.error.message);
  }

  const speakingRows = (speakingRes.data ?? []) as {
    overall: number | null;
    word_count: number | null;
    created_at: string;
    feedback: { errorPatterns?: string[] } | null;
  }[];
  const writingRows = (writingRes.data ?? []) as {
    overall: number | null;
    word_count: number | null;
    created_at: string;
    feedback: { errorPatterns?: string[] } | null;
  }[];

  const speakingLatest = typeof speakingRows[0]?.overall === 'number' ? Math.round(speakingRows[0].overall) : null;
  const speakingPrev = typeof speakingRows[1]?.overall === 'number' ? Math.round(speakingRows[1].overall) : null;
  const writingLatest = typeof writingRows[0]?.overall === 'number' ? Math.round(writingRows[0].overall) : null;
  const writingPrev = typeof writingRows[1]?.overall === 'number' ? Math.round(writingRows[1].overall) : null;

  let totalWords = 0;
  let currentWeekWords = 0;
  let prevWeekWords = 0;
  for (const row of [...speakingRows, ...writingRows]) {
    const wc = Number(row.word_count ?? 0);
    if (wc > 0) {
      totalWords += wc;
      if (row.created_at >= sevenDaysAgoIso) currentWeekWords += wc;
      else if (row.created_at >= fourteenDaysAgoIso) prevWeekWords += wc;
    }
  }

  const tagCounts = new Map<string, number>();
  const weeklyCounts = new Map<string, number>();
  const prevWeeklyCounts = new Map<string, number>();

  const normalizedErrors = (learnerErrorsRes.data ?? []) as {
    category: string;
    created_at: string;
    source_word_count: number | null;
  }[];

  let totalErrorsCurrentWeek = 0;
  let totalErrorsPrevWeek = 0;

  if (normalizedErrors.length > 0) {
    for (const row of normalizedErrors) {
      tagCounts.set(row.category, (tagCounts.get(row.category) ?? 0) + 1);
      if (row.created_at >= sevenDaysAgoIso) {
        weeklyCounts.set(row.category, (weeklyCounts.get(row.category) ?? 0) + 1);
        totalErrorsCurrentWeek++;
      } else if (row.created_at >= fourteenDaysAgoIso) {
        prevWeeklyCounts.set(row.category, (prevWeeklyCounts.get(row.category) ?? 0) + 1);
        totalErrorsPrevWeek++;
      }
    }
  }

  const MIN_WORDS_FOR_RATE = 200;
  const hasEnoughWordData = totalWords >= MIN_WORDS_FOR_RATE;
  const hasEnoughTrendData =
    currentWeekWords >= MIN_WORDS_FOR_RATE && prevWeekWords >= MIN_WORDS_FOR_RATE;

  const safeWordsTotal = totalWords > 0 ? totalWords : 100;
  const currentDensityDenom = currentWeekWords > 0 ? currentWeekWords : safeWordsTotal;

  const errorsPer100Words =
    hasEnoughWordData && normalizedErrors.length > 0
      ? Number(((normalizedErrors.length / totalWords) * 100).toFixed(1))
      : null;

  const currentRate = hasEnoughTrendData
    ? Number(((totalErrorsCurrentWeek / currentWeekWords) * 100).toFixed(1))
    : null;
  const prevRate = hasEnoughTrendData
    ? Number(((totalErrorsPrevWeek / prevWeekWords) * 100).toFixed(1))
    : null;
  const errorsPer100WordsDelta =
    currentRate !== null && prevRate !== null ? Number((currentRate - prevRate).toFixed(1)) : null;

  const recurringErrors: RecurringErrorTag[] = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tag, count]) => {
      const wkCount = weeklyCounts.get(tag) ?? 0;
      const prevWkCount = prevWeeklyCounts.get(tag) ?? 0;
      const per100 = Number((((currentWeekWords > 0 ? wkCount : count) / currentDensityDenom) * 100).toFixed(1));
      const per100Prev = hasEnoughTrendData
        ? Number(((prevWkCount / prevWeekWords) * 100).toFixed(1))
        : null;
      const trend: RecurringErrorTag['trend'] =
        !hasEnoughTrendData || per100Prev === null
          ? 'stable'
          : per100 < per100Prev - 0.1
            ? 'improving'
            : per100 > per100Prev + 0.1
              ? 'worsening'
              : 'stable';

      return {
        tag,
        label: ERROR_TAG_LABELS[tag] ?? tag.replace(/_/g, ' '),
        count,
        weeklyCount: wkCount,
        per100Words: per100,
        per100WordsPrev: per100Prev,
        trend,
      };
    });

  const placementRaw = subRes.data?.placement_result as { band?: string; recommended_lesson?: number } | null | undefined;

  return {
    signedIn: true,
    dashboard: (dashRes.data as DashboardPayload | null) ?? null,
    recentXp: (xpRes.data as XpEventRow[] | null) ?? [],
    weeklyGoalHours: Number(prefRes.data?.target_hours_per_week ?? 4),
    weeklyReport: (reportRes.data as WeeklyReportRow | null) ?? null,
    subscriptionStatus: subRes.data?.subscription_status ?? null,
    telemetry: {
      activeVocabMastered: vocabMasteredRes.count ?? 0,
      activeVocabTotal: vocabTotalRes.count ?? 0,
      speakingCount: speakingRows.length,
      speakingLatest,
      speakingDelta: speakingLatest !== null && speakingPrev !== null ? speakingLatest - speakingPrev : null,
      writingCount: writingRows.length,
      writingLatest,
      writingDelta: writingLatest !== null && writingPrev !== null ? writingLatest - writingPrev : null,
      recurringErrors,
      errorsPer100Words,
      errorsPer100WordsDelta,
      hasEnoughWordData,
      hasEnoughTrendData,
      minWordsRequired: MIN_WORDS_FOR_RATE,
      totalWordsEvaluated: totalWords,
      dueErrorCards: dueErrorCardsRes.count ?? 0,
      masteredErrorCards: masteredErrorCardsRes.count ?? 0,
      missedPracticeCount: missedRes.count ?? 0,
      placementRecommendation: placementRaw ?? null,
    },
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
      supabase.from('profiles').select('xp_total, streak_days, learner_band, role').eq('id', user.id).maybeSingle(),
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
      role: (profileRes.data?.role as HeaderSummary['role']) ?? 'learner',
    };
  } catch {
    return { signedIn: false, xpTotal: 0, streakDays: 0, band: 'B1_low', lessonsCompleted: 0 };
  }
}

export async function loadErrorReviewCards(): Promise<{
  signedIn: boolean;
  cards: ErrorReviewCardRow[];
}> {
  const supabase = await createServerSupabase();
  if (!supabase) return { signedIn: false, cards: [] };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { signedIn: false, cards: [] };

  const { data } = await supabase
    .from('error_review_cards')
    .select(
      'id, category, prompt_sentence, corrected_sentence, context_sentence, card_format, occurrence_count, mastered, explanation, due_at, interval_days, stability, difficulty, fsrs_state, learning_steps, reps, lapses, last_review_at',
    )
    .eq('user_id', user.id)
    .eq('suspended', false)
    .eq('mastered', false)
    .lte('due_at', new Date().toISOString())
    .order('due_at', { ascending: true })
    .limit(20);

  return {
    signedIn: true,
    cards: (data as ErrorReviewCardRow[] | null) ?? [],
  };
}

export async function loadObservabilitySummary(days = 7): Promise<AiObservabilitySummary | null> {
  const supabase = await createServerSupabase();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc('get_ai_observability_summary', { p_days: days });
  if (error || !data) return null;
  return data as AiObservabilitySummary;
}

export async function loadPlacementQuestions(): Promise<PlacementQuestionRow[]> {
  const supabase = await createServerSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('placement_questions')
    .select('id, sort_order, area, question, options, answer_index')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    id: String(row.id),
    sort_order: Number(row.sort_order),
    area: String(row.area),
    question: String(row.question),
    options: Array.isArray(row.options) ? row.options.map(String) : [],
    answer_index: Number(row.answer_index),
  }));
}

export async function loadTeacherRoster(): Promise<{
  signedIn: boolean;
  authorized: boolean;
  learners: TeacherRosterLearner[];
}> {
  const supabase = await createServerSupabase();
  if (!supabase) return { signedIn: false, authorized: false, learners: [] };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { signedIn: false, authorized: false, learners: [] };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = profile?.role;
  if (role !== 'teacher' && role !== 'admin') {
    return { signedIn: true, authorized: false, learners: [] };
  }

  const { data, error } = await supabase.rpc('teacher_get_roster');
  if (error) {
    console.error('teacher_get_roster failed:', error.message);
    return { signedIn: true, authorized: true, learners: [] };
  }

  return {
    signedIn: true,
    authorized: true,
    learners: (Array.isArray(data) ? data : []) as TeacherRosterLearner[],
  };
}

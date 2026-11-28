import { createServerSupabase } from '@/utils/supabase/server';
import { createAdminSupabase } from '@/utils/supabase/admin';
import { ERROR_CATEGORY_LABELS } from './feedback-schema';
import { weekSpeakingAttemptRecordings, weekSpeakingTakeRecording } from './week-speaking-recordings.mjs';
import { orderQueue, planQueue } from './review-queue.mjs';
import type {
  AiObservabilitySummary,
  DashboardSkillTelemetry,
  ErrorReviewCardRow,
  HeaderSummary,
  LearnerBand,
  PlacementQuestionRow,
  PlacementTextRow,
  RecurringErrorTag,
  ReviewQueueCard,
  TeacherRosterLearner,
  VocabDueRow,
  XpEventRow,
} from './types';

/** The live placement diagnostic. `legacy` rows exist alongside it and must not leak in. */
export const PLACEMENT_VERSION = 'v2';

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
  userId: string | null;
  recentXp: XpEventRow[];
  weeklyGoalHours: number;
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
    placementRecommendation: null,
  };

  const supabase = await createServerSupabase();
  if (!supabase) {
    return {
      signedIn: false,
      userId: null,
      recentXp: [],
      weeklyGoalHours: 4,
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
      userId: null,
      recentXp: [],
      weeklyGoalHours: 4,
      subscriptionStatus: null,
      telemetry: emptyTelemetry,
    };
  }

  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgoIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [
    xpRes,
    prefRes,
    subRes,
    vocabMasteredRes,
    vocabTotalRes,
    speakingRes,
    writingRes,
    learnerErrorsRes,
  ] = await Promise.all([
    supabase
      .from('xp_events')
      .select('id, source, points, note, created_at')
      .order('created_at', { ascending: false })
      .limit(6),
    supabase.from('curriculum_preferences').select('target_hours_per_week').maybeSingle(),
    supabase.from('profiles').select('subscription_status, placement_result').eq('id', user.id).maybeSingle(),
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
      .from('learner_errors')
      .select('category, created_at, source_word_count')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(300),
  ]);


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
    userId: user.id,
    recentXp: (xpRes.data as XpEventRow[] | null) ?? [],
    weeklyGoalHours: Number(prefRes.data?.target_hours_per_week ?? 4),
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
      placementRecommendation: placementRaw ?? null,
    },
  };
}

export async function loadHeaderSummary(): Promise<HeaderSummary> {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) {
      return { signedIn: false, band: 'B1_low' };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { signedIn: false, band: 'B1_low' };
    }

    const profileRes = await supabase.from('profiles').select('learner_band, role').eq('id', user.id).maybeSingle();

    return {
      signedIn: true,
      band: (profileRes.data?.learner_band as LearnerBand | undefined) ?? 'B1_low',
      role: (profileRes.data?.role as HeaderSummary['role']) ?? 'learner',
    };
  } catch {
    return { signedIn: false, band: 'B1_low' };
  }
}

/**
 * Today's review queue.
 *
 * Two card types share one daily allowance: error-repair cards from the learner's
 * own mistakes, and vocabulary cards fed by the weekly steps. They are fetched
 * as two due lists, merged, ordered (most overdue first, then most often missed)
 * and cut at the cap.
 *
 * The count of what has already been reviewed today is read here rather than in
 * the browser, so reloading the page does not hand out twenty more cards.
 * Quiz cards (error repair) also carry whether they have a typed answer:
 * requirement 1 says a card with no typed answer keeps its four self-rating
 * buttons, and a vocabulary card is answered by recall, so it is self-rated.
 */
export async function loadReviewQueue(options: { ignoreCap?: boolean } = {}): Promise<{
  signedIn: boolean;
  queue: ReturnType<typeof planQueue> & { cards: ReviewQueueCard[] };
  totalDue: number;
  reviewedToday: number;
}> {
  const empty = planQueue([]);
  const supabase = await createServerSupabase();
  if (!supabase) return { signedIn: false, queue: { ...empty, cards: [] }, totalDue: 0, reviewedToday: 0 };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { signedIn: false, queue: { ...empty, cards: [] }, totalDue: 0, reviewedToday: 0 };

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Every due card, not only the first 20: the page has to know how many are
  // left over to decide whether "Review more" is worth offering. One row per
  // learner-day cap keeps this small in practice.
  const [errorResult, vocabResult, errorToday, vocabToday] = await Promise.all([
    supabase
      .from('error_review_cards')
      .select(
        'id, category, prompt_sentence, corrected_sentence, context_sentence, card_format, occurrence_count, mastered, explanation, due_at, interval_days, stability, difficulty, fsrs_state, learning_steps, reps, lapses, last_review_at, last_reviewed_on',
      )
      .eq('user_id', user.id)
      .eq('suspended', false)
      .eq('mastered', false)
      .lte('due_at', now.toISOString())
      .order('due_at', { ascending: true })
      .limit(200),
    supabase.rpc('get_due_cards', { p_limit: 200 }),
    supabase
      .from('error_review_cards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('last_reviewed_on', today),
    supabase
      .from('vocab_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('reviewed_at', `${today}T00:00:00.000Z`),
  ]);

  const errorCards = (errorResult.data as ErrorReviewCardRow[] | null) ?? [];
  const vocabRows = (vocabResult.data as VocabDueRow[] | null) ?? [];

  const cards: ReviewQueueCard[] = [
    ...errorCards.map((card) => ({
      ...card,
      type: 'error' as const,
      // An error card is repaired by typing; that is the whole exercise.
      hasTypedAnswer: true as const,
    })),
    ...vocabRows.map((row) => ({
      type: 'vocab' as const,
      id: row.card_id,
      vocab_item_id: row.vocab_item_id,
      term: row.term,
      definition: row.definition,
      example: row.example,
      part_of_speech: row.part_of_speech,
      translation_es: row.translation_es,
      due_at: row.due_at,
      interval_days: null,
      stability: null,
      difficulty: null,
      fsrs_state: null,
      learning_steps: null,
      reps: null,
      lapses: null,
      last_review_at: null,
      last_reviewed_on: null,
      hasTypedAnswer: false as const,
    })),
  ];

  const reviewedToday = (errorToday.count ?? 0) + (vocabToday.count ?? 0);
  const plan = planQueue(cards, { reviewedToday });
  // planQueue orders and counts; the slice keeps the order it decided on.
  // "Review more" asks for everything still due, so it passes ignoreCap.
  const ordered = orderQueue(cards) as ReviewQueueCard[];
  const queue = {
    ...plan,
    cards: options.ignoreCap ? ordered : ordered.slice(0, plan.shown),
  };

  return { signedIn: true, queue, totalDue: cards.length, reviewedToday };
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

/** Learner-facing placement questions: no answer indices, via the safe view. */
export async function loadPlacementQuestions(): Promise<PlacementQuestionRow[]> {
  const supabase = await createServerSupabase();
  if (!supabase) return [];
  // `placement_questions_safe` returns the active v2 questions plus the 24 legacy
  // ones, and both versions share sort_order 1–24. Ordering by sort_order alone
  // therefore interleaves them: 48 rows, two per question, each with four options.
  // The page then rendered eight answer buttons per question and the component's
  // "answers.length !== questions.length" read was meaningless. Select the
  // version explicitly and dedupe by position so a question is never shown twice.
  const { data, error } = await supabase
    .from('placement_questions_safe')
    .select('id, sort_order, area, skill, question, options, code, text_id, version')
    .eq('version', PLACEMENT_VERSION)
    .order('sort_order', { ascending: true });
  if (error || !data) return [];
  const seen = new Set<number>();
  return data
    .filter((row) => {
      const order = Number(row.sort_order);
      if (seen.has(order)) return false;
      seen.add(order);
      return true;
    })
    .map((row) => ({
      id: String(row.id),
      sort_order: Number(row.sort_order),
      code: String(row.code),
      text_id: row.text_id ? String(row.text_id) : null,
      skill: row.skill === 'grammar' || row.skill === 'vocabulary' || row.skill === 'reading' ? row.skill : null,
      area: String(row.area),
      question: String(row.question),
      options: Array.isArray(row.options) ? row.options.map(String) : [],
    }));
}

/** Public reading passages for the placement quiz. */
export async function loadPlacementTexts(): Promise<PlacementTextRow[]> {
  const supabase = await createServerSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.from('placement_texts_safe').select('id, title, body');
  if (error || !data) return [];
  return data.map((row) => ({ id: String(row.id), title: String(row.title), body: String(row.body) }));
}

/** Server-only answer key for placement scoring; never sent to the browser. */
export async function loadPlacementAnswerKey(): Promise<number[]> {
  const admin = createAdminSupabase();
  if (!admin) {
    console.error('[placement] Answer key client is not configured');
    return [];
  }
  const { data, error } = await admin
    .from('placement_questions')
    .select('answer_index')
    .eq('active', true)
    .eq('version', 'v2')
    .order('sort_order', { ascending: true });
  if (error || !data) {
    console.error('[placement] Could not load answer key:', error ?? 'no data');
    return [];
  }
  return data.map((row) => Number(row.answer_index));
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

  const [{ data, error }, attemptsRes, pilotRes] = await Promise.all([
    supabase.rpc('teacher_get_roster'),
    supabase
      .from('mediation_attempts')
      .select('id, user_id, week, task_key, transcript, response_text, feedback, needs_review, review_reason, disputed, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('pilot_learners').select('user_id'),
  ]);
  if (error) {
    console.error('teacher_get_roster failed:', error.message);
    return { signedIn: true, authorized: true, learners: [] };
  }

  const attemptsByUser = new Map<string, TeacherRosterLearner['mediation_attempts']>();
  for (const row of attemptsRes.data ?? []) {
    const list = attemptsByUser.get(row.user_id) ?? [];
    list.push({
      id: String(row.id),
      week: Number(row.week),
      task_key: String(row.task_key),
      transcript: row.transcript ? String(row.transcript) : null,
      response_text: row.response_text ? String(row.response_text) : null,
      feedback: (row.feedback ?? {}) as Record<string, unknown>,
      needs_review: Boolean(row.needs_review),
      review_reason: row.review_reason ? String(row.review_reason) : null,
      disputed: Boolean(row.disputed),
      created_at: String(row.created_at),
    });
    attemptsByUser.set(row.user_id, list);
  }

  const roster = (Array.isArray(data) ? data : []) as TeacherRosterLearner[];
  const recordingsByUser = new Map<string, ReturnType<typeof weekSpeakingAttemptRecordings>>();
  // The roster RPC is already staff-gated. Use the service-role client for the
  // weekly rows when available so teacher playback works before 0062 is applied
  // to a project; otherwise the authenticated client's staff RLS policy applies.
  const recordingClient = createAdminSupabase() ?? supabase;
  if (roster.length > 0) {
    const { data: recordingRows, error: recordingError } = await recordingClient
      .from('week_speaking_attempts')
      .select('id,user_id,week_number,first_recording_path,second_recording_path,created_at')
      .in('user_id', roster.map((learner) => learner.user_id))
      .order('created_at', { ascending: false })
      .order('week_number', { ascending: true })
      .limit(500);
    if (recordingError) {
      console.error('teacher weekly recordings failed:', recordingError.message);
    } else {
      for (const row of recordingRows ?? []) {
        const list = recordingsByUser.get(row.user_id) ?? [];
        list.push(...weekSpeakingAttemptRecordings(row));
        recordingsByUser.set(row.user_id, list);
      }
    }
    const { data: takeRows, error: takeError } = await recordingClient
      .from('week_speaking_takes')
      .select('id,user_id,week_number,attempt_id,kind,sequence,recording_path,status,created_at')
      .in('user_id', roster.map((learner) => learner.user_id))
      .in('status', ['ready', 'checking', 'checked', 'abandoned'])
      .order('created_at', { ascending: false }).limit(1500);
    if (takeError) console.error('teacher weekly takes failed:', takeError.message);
    else for (const row of takeRows ?? []) {
      const link = weekSpeakingTakeRecording(row);
      if (!link) continue;
      const list = recordingsByUser.get(row.user_id) ?? [];
      list.push(link);
      recordingsByUser.set(row.user_id, list);
    }
    for (const list of recordingsByUser.values()) {
      list.sort((a, b) => a.weekNumber - b.weekNumber || a.takeNumber - b.takeNumber);
    }
  }

  const learners = roster.map((learner) => ({
    ...learner,
    pilot: pilotRes.error ? null : (pilotRes.data ?? []).some((row) => row.user_id === learner.user_id),
    mediation_attempts: attemptsByUser.get(learner.user_id) ?? [],
    weekly_recordings: recordingsByUser.get(learner.user_id) ?? [],
  }));

  return { signedIn: true, authorized: true, learners };
}

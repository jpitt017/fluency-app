import { createServerSupabase } from '@/utils/supabase/server';
import { ERROR_CATEGORY_LABELS } from './feedback-schema';
import type {
  CheckpointDetail,
  ContentInput,
  CurriculumOutline,
  DashboardPayload,
  DashboardSkillTelemetry,
  ErrorReviewCardRow,
  HeaderSummary,
  LearnerBand,
  LessonPayload,
  MissedPracticeItem,
  OutlineCheckpoint,
  PlacementQuestionRow,
  PracticeItem,
  RecurringErrorTag,
  SkillArea,
  SpeakingTask,
  VocabDeckSummary,
  WeeklyReportRow,
  WritingTask,
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
    dueErrorCards: 0,
    missedPracticeCount: 0,
    placementRecommendation: null,
  };

  const supabase = await createServerSupabase();
  if (!supabase) {
    return {
      signedIn: false,
      dashboard: null,
      recentXp: [],
      weeklyGoalHours: 8,
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
      weeklyGoalHours: 8,
      weeklyReport: null,
      subscriptionStatus: null,
      telemetry: emptyTelemetry,
    };
  }

  const nowIso = new Date().toISOString();
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

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
      .select('overall, feedback')
      .eq('user_id', user.id)
      .eq('status', 'evaluated')
      .order('created_at', { ascending: false })
      .limit(12),
    supabase
      .from('writing_submissions')
      .select('overall, feedback')
      .eq('user_id', user.id)
      .eq('status', 'evaluated')
      .order('created_at', { ascending: false })
      .limit(12),
    supabase
      .from('practice_attempts')
      .select('item_id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_correct', false),
    supabase
      .from('learner_errors')
      .select('category, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('error_review_cards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('suspended', false)
      .lte('due_at', nowIso),
  ]);

  if (dashRes.error) {
    console.error('get_learner_dashboard failed:', dashRes.error.message);
  }

  const speakingRows = (speakingRes.data ?? []) as { overall: number | null; feedback: { errorPatterns?: string[] } | null }[];
  const writingRows = (writingRes.data ?? []) as { overall: number | null; feedback: { errorPatterns?: string[] } | null }[];

  const speakingLatest = typeof speakingRows[0]?.overall === 'number' ? Math.round(speakingRows[0].overall) : null;
  const speakingPrev = typeof speakingRows[1]?.overall === 'number' ? Math.round(speakingRows[1].overall) : null;
  const writingLatest = typeof writingRows[0]?.overall === 'number' ? Math.round(writingRows[0].overall) : null;
  const writingPrev = typeof writingRows[1]?.overall === 'number' ? Math.round(writingRows[1].overall) : null;

  const tagCounts = new Map<string, number>();
  const weeklyCounts = new Map<string, number>();

  const normalizedErrors = (learnerErrorsRes.data ?? []) as { category: string; created_at: string }[];
  if (normalizedErrors.length > 0) {
    for (const row of normalizedErrors) {
      tagCounts.set(row.category, (tagCounts.get(row.category) ?? 0) + 1);
      if (row.created_at >= sevenDaysAgoIso) {
        weeklyCounts.set(row.category, (weeklyCounts.get(row.category) ?? 0) + 1);
      }
    }
  } else {
    for (const row of [...speakingRows, ...writingRows]) {
      const tags = row.feedback?.errorPatterns;
      if (Array.isArray(tags)) {
        for (const tag of tags) {
          if (typeof tag === 'string') {
            tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
          }
        }
      }
    }
  }

  const recurringErrors: RecurringErrorTag[] = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tag, count]) => ({
      tag,
      label: ERROR_TAG_LABELS[tag] ?? tag.replace(/_/g, ' '),
      count,
      weeklyCount: weeklyCounts.get(tag) ?? 0,
    }));

  const placementRaw = subRes.data?.placement_result as { band?: string; recommended_lesson?: number } | null | undefined;

  return {
    signedIn: true,
    dashboard: (dashRes.data as DashboardPayload | null) ?? null,
    recentXp: (xpRes.data as XpEventRow[] | null) ?? [],
    weeklyGoalHours: Number(prefRes.data?.target_hours_per_week ?? 8),
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
      dueErrorCards: dueErrorCardsRes.count ?? 0,
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
      .select('id, deck_id, term, part_of_speech, ipa, definition, example, collocations, translation_es, audio_url, band')
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
      audio_url: row.audio_url ?? null,
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
          .select('id, kind, title, source_label, accent, audio_url, body, duration_seconds, word_count, questions')
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

export async function loadMissedPracticeItems(): Promise<{
  signedIn: boolean;
  items: MissedPracticeItem[];
}> {
  const supabase = await createServerSupabase();
  if (!supabase) return { signedIn: false, items: [] };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { signedIn: false, items: [] };

  const { data: attempts } = await supabase
    .from('practice_attempts')
    .select(
      'item_id, lesson_id, practice_items!inner(id, prompt, options, answer, explanation), lessons(lesson_number)',
    )
    .eq('user_id', user.id)
    .eq('is_correct', false)
    .order('attempted_at', { ascending: false })
    .limit(40);

  const seen = new Set<string>();
  const items: MissedPracticeItem[] = [];

  for (const row of attempts ?? []) {
    if (seen.has(row.item_id)) continue;
    seen.add(row.item_id);

    const pi = (Array.isArray(row.practice_items) ? row.practice_items[0] : row.practice_items) as {
      id: string;
      prompt: string;
      options: string[] | null;
      answer: string;
      explanation: string | null;
    } | null;

    const lessonRel = (Array.isArray(row.lessons) ? row.lessons[0] : row.lessons) as {
      lesson_number?: number;
    } | null;

    if (!pi) continue;
    items.push({
      id: pi.id,
      lesson_id: row.lesson_id,
      lesson_number: lessonRel?.lesson_number ?? null,
      prompt: pi.prompt,
      options: pi.options,
      answer: pi.answer,
      explanation: pi.explanation,
    });
    if (items.length >= 15) break;
  }

  return { signedIn: true, items };
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
      'id, category, prompt_sentence, corrected_sentence, explanation, due_at, interval_days, stability, difficulty, fsrs_state, learning_steps, reps, lapses, last_review_at',
    )
    .eq('user_id', user.id)
    .eq('suspended', false)
    .lte('due_at', new Date().toISOString())
    .order('due_at', { ascending: true })
    .limit(20);

  return {
    signedIn: true,
    cards: (data as ErrorReviewCardRow[] | null) ?? [],
  };
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

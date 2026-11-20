/**
 * Row shapes returned by the B1 → B2 project (see supabase-b1-b2/README.md).
 *
 * `get_lesson()` returns heterogeneous JSON per block, so block content is
 * modelled as a discriminated union keyed by `block_kind` — that keeps the UI
 * honest instead of each block reading a `Record<string, any>`.
 */

export type BlockKind = 'warm_up' | 'input' | 'practice' | 'output' | 'feedback';

export type SkillArea =
  | 'grammar'
  | 'vocabulary'
  | 'listening'
  | 'reading'
  | 'speaking'
  | 'writing'
  | 'review';

export type LessonStatus = 'not_started' | 'in_progress' | 'completed';
export type SessionRequirement = 'optional' | 'either_wed_thu' | 'required';
export type UserRole = 'learner' | 'teacher' | 'admin';

export interface LessonRow {
  id: string;
  module_id: string;
  lesson_number: number;
  module_lesson_number: number;
  day_of_week?: string | null;
  session_requirement?: SessionRequirement | string;
  output_required?: boolean;
  title: string;
  objective: string;
  can_do: string;
  grammar_point: string | null;
  grammar_point_key: string | null;
  explanation: string;
  primary_skill: SkillArea;
  duration_minutes: number;
  xp_reward: number;
}

export interface ModuleSummary {
  id: string;
  number: number;
  week_number?: number;
  phase?: string | null;
  title: string;
  summary: string;
  topic: string;
  grammar: string[];
  light_grammar?: string | null;
  hours: number;
}

export interface WarmUpContent {
  summary: string;
  card_count: number;
  deck_slug: string;
  review_ladder_days: number[];
}

export interface InputContent {
  summary: string;
  input_kind: 'listening' | 'reading';
  key_points: string[];
  model_example: string;
}

export interface PracticeContent {
  summary: string;
  item_count: number;
  mix: { grammar?: number; vocabulary?: number };
  answer_mode: string;
}

export interface OutputContent {
  summary: string;
  can_do: string;
  mode: SkillArea;
  target_seconds: number;
  word_range: [number, number];
}

export interface FeedbackContent {
  summary: string;
  can_do: string;
  rubric: string[];
}

export type BlockContent =
  | WarmUpContent
  | InputContent
  | PracticeContent
  | OutputContent
  | FeedbackContent;

export interface LessonBlock<K extends BlockKind = BlockKind> {
  id: string;
  lesson_id: string;
  block_kind: K;
  sort_order: number;
  minutes: number;
  title: string;
  content: BlockContent;
}

export interface PracticeItem {
  id: string;
  kind: string;
  sort_order: number;
  prompt: string;
  options: string[] | null;
  answer: string;
  explanation: string | null;
  difficulty: number;
}

export interface InputQuestion {
  prompt: string;
  options: string[];
  answer: string;
}

export interface SpeakerAccentMeta {
  speaker: string;
  accent: string;
  label: string;
}

export interface ContentInput {
  id: string;
  kind: 'listening' | 'reading';
  title: string;
  source_label: string;
  accent: string | null;
  audio_url?: string | null;
  speaker_accents?: SpeakerAccentMeta[];
  body: string;
  duration_seconds: number | null;
  word_count: number | null;
  questions: InputQuestion[];
}

export interface SpeakingTask {
  id: string;
  kind: string;
  title: string;
  prompt: string;
  target_seconds: number;
  useful_phrases: string[];
  target_linkers: string[];
  target_terms: string[];
}

export interface WritingTask {
  id: string;
  title: string;
  prompt: string;
  format: string;
  word_min: number;
  word_max: number;
  outline: Record<string, string>;
}

export interface LessonProgressRow {
  id: string;
  status: LessonStatus;
  blocks_completed: number;
  practice_correct: number;
  practice_total: number;
  output_submitted: boolean;
  completed_at: string | null;
}

export interface PersonalErrorLogItem {
  id: string;
  category: string;
  incorrect_sentence: string;
  target_sentence: string;
  explanation: string | null;
  occurrence_count: number;
  mastered: boolean;
}

export interface LessonPayload {
  lesson: LessonRow;
  module: ModuleSummary;
  blocks: LessonBlock[];
  items: PracticeItem[];
  input: ContentInput | null;
  speaking: SpeakingTask | null;
  writing: WritingTask | null;
  progress: LessonProgressRow | null;
  personal_error_log?: PersonalErrorLogItem[];
}

export interface OutlineLesson {
  id: string;
  number: number;
  module_lesson: number;
  day_of_week?: string | null;
  requirement?: SessionRequirement | string;
  output_required?: boolean;
  title: string;
  objective: string;
  can_do: string;
  skill: SkillArea;
  minutes?: number;
  status: LessonStatus;
  output_submitted?: boolean;
  practice_correct: number | null;
  practice_total: number | null;
  completed_at: string | null;
}

export interface OutlineModule {
  id: string;
  number: number;
  week_number?: number;
  phase?: string | null;
  title: string;
  summary: string;
  topic: string;
  grammar: string[];
  light_grammar?: string | null;
  hours: number;
  lesson_start: number;
  lesson_end: number;
  lessons: OutlineLesson[];
}

export interface OutlineCheckpoint {
  code: string;
  title: string;
  timing: string;
  description: string;
  module: number | null;
  status: LessonStatus;
  teacher_status?: string | null;
  teacher_readiness_decision?: string | null;
  completed_at: string | null;
}

export interface DailyFlowItem {
  block?: string;
  day?: string;
  step?: number;
  kind?: string;
  requirement?: string;
  minutes: number;
  label: string;
  description: string;
}

export interface CourseRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string;
  level_from: string;
  level_to: string;
  total_hours: number;
  min_hours?: number | null;
  weekly_hours: number;
  duration_weeks: number | null;
  daily_minutes_min: number;
  daily_minutes_max: number;
  live_lessons_per_week?: { count: number; minutes: number[] } | null;
  positioning?: string | null;
  daily_flow: DailyFlowItem[];
  skill_balance: { skill: string; hours: number }[];
}

export interface CurriculumOutline {
  course: CourseRow | null;
  modules: OutlineModule[];
  skills: Record<string, number>;
  due_cards: number;
  listening_weeks_completed?: number;
  reading_weeks_completed?: number;
  checkpoints: OutlineCheckpoint[];
}

export type LearnerBand =
  | 'B1_low'
  | 'B1_mid'
  | 'B1_high'
  | 'B1_plus'
  | 'B2_entry'
  | 'B2_developing'
  | 'B2_solid';

export interface DashboardPayload {
  profile: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    learner_band: LearnerBand;
    target_band: LearnerBand;
    role?: UserRole;
    xp_total: number;
    streak_days: number;
    longest_streak: number;
    daily_word_goal: number;
    onboarding_completed: boolean;
    subscription_status?: string | null;
  } | null;
  role?: UserRole;
  xp_total: number;
  learner_band: LearnerBand;
  streak_days: number;
  skills: Record<string, { score: number; lessons: number }>;
  due_cards: number;
  lessons_completed: number;
  next_lesson: {
    id: string;
    lesson_number: number;
    title: string;
    can_do: string;
    day_of_week?: string | null;
    week_number?: number | null;
    module_title: string;
  } | null;
  badges: {
    code: string;
    title: string;
    earned_at: string;
  }[];
}

export interface XpEventRow {
  id: string;
  source: string;
  points: number;
  note: string | null;
  created_at: string;
}

export interface HeaderSummary {
  signedIn: boolean;
  xpTotal: number;
  streakDays: number;
  band: LearnerBand;
  lessonsCompleted: number;
  role?: UserRole;
}

export interface VocabDeckSummary {
  id: string;
  slug: string;
  title: string;
  topic: string;
  description: string;
  daily_target: number;
  module_number: number | null;
  items: {
    id: string;
    term: string;
    part_of_speech: string;
    ipa: string | null;
    definition: string;
    example: string;
    collocations: string[];
    translation_es: string | null;
    audio_url?: string | null;
    band: string;
  }[];
}

export interface WeeklyReportRow {
  id: string;
  week_start: string;
  study_minutes: number;
  words_learned: number;
  recordings: number;
  writing_tasks: number;
  weakest_skill: SkillArea | null;
  payload: Record<string, unknown>;
}

export interface CheckpointDetail {
  id: string;
  code: string;
  title: string;
  timing_label: string;
  description: string;
  duration_minutes: number;
  skills: SkillArea[];
  tasks: { kind: string; title: string; detail: string; minutes: number }[];
  module: {
    id: string;
    module_number: number;
    title: string;
    summary: string;
    grammar_focus: string[];
    vocabulary_topic: string;
  } | null;
  inputs: ContentInput[];
  practiceItems: PracticeItem[];
  speakingTask: SpeakingTask | null;
  writingTask: WritingTask | null;
  latestAttempt: {
    id: string;
    status: string;
    scores: Record<string, unknown>;
    result: Record<string, unknown>;
    teacher_status?: string | null;
    teacher_notes?: string | null;
    teacher_readiness_decision?: string | null;
    completed_at: string | null;
  } | null;
}

export interface RecurringErrorTag {
  tag: string;
  label: string;
  count: number;
  weeklyCount?: number;
  per100Words: number;
  per100WordsPrev: number | null;
  trend: 'improving' | 'stable' | 'worsening';
}

export interface ErrorReviewCardRow {
  id: string;
  category: string;
  prompt_sentence: string;
  corrected_sentence: string;
  context_sentence?: string | null;
  card_format?: string;
  occurrence_count?: number;
  mastered?: boolean;
  explanation: string;
  due_at: string;
  interval_days: number;
  stability: number;
  difficulty: number;
  fsrs_state: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  last_review_at: string | null;
}

export interface PlacementQuestionRow {
  id: string;
  sort_order: number;
  area: string;
  question: string;
  options: string[];
  answer_index: number;
}

export interface AiObservabilitySummary {
  days: number;
  total_requests: number;
  cache_hits: number;
  cache_hit_rate: number;
  failure_count: number;
  avg_latency_ms: number;
  total_cost_usd: number;
  endpoints: {
    endpoint: string;
    requests: number;
    cache_hits: number;
    failures: number;
    avg_latency_ms: number;
    total_cost_usd: number;
  }[];
}

export interface DashboardSkillTelemetry {
  activeVocabMastered: number;
  activeVocabTotal: number;
  speakingCount: number;
  speakingLatest: number | null;
  speakingDelta: number | null;
  writingCount: number;
  writingLatest: number | null;
  writingDelta: number | null;
  recurringErrors: RecurringErrorTag[];
  errorsPer100Words: number | null;
  errorsPer100WordsDelta: number | null;
  hasEnoughWordData: boolean;
  hasEnoughTrendData: boolean;
  minWordsRequired: number;
  totalWordsEvaluated: number;
  dueErrorCards: number;
  masteredErrorCards: number;
  missedPracticeCount: number;
  placementRecommendation: {
    band?: string;
    recommended_lesson?: number;
  } | null;
}

export interface MissedPracticeItem {
  id: string;
  lesson_id: string;
  lesson_number: number | null;
  prompt: string;
  options: string[] | null;
  answer: string;
  explanation: string | null;
}

export interface TeacherRosterLearner {
  user_id: string;
  full_name: string;
  email: string | null;
  learner_band: LearnerBand;
  streak_days: number;
  longest_streak: number;
  last_active_on: string | null;
  current_lesson_number: number;
  total_sessions_completed: number;
  listening_weeks: number;
  reading_weeks: number;
  weeks: {
    week_number: number;
    title: string;
    sessions_completed: number;
    wed_or_thu_done: boolean;
    fri_speaking_done: boolean;
    sat_writing_done: boolean;
  }[];
  checkpoints: {
    attempt_id: string;
    code: string;
    title: string;
    timing: string;
    status: string;
    scores: Record<string, unknown>;
    result: Record<string, unknown>;
    teacher_status: string | null;
    teacher_notes: string | null;
    teacher_readiness_decision: string | null;
    completed_at: string | null;
  }[];
  top_errors: {
    error_category: string;
    occurrences: number;
    examples: { incorrect: string; target: string; explanation: string | null }[];
  }[];
  recent_speaking: {
    id: string;
    task_title: string | null;
    duration_seconds: number | null;
    transcript: string | null;
    overall: number | null;
    feedback: Record<string, unknown> | null;
    teacher_status: string;
    teacher_notes: string | null;
    teacher_pronunciation_note: string | null;
    created_at: string;
  }[];
  recent_writing: {
    id: string;
    task_title: string | null;
    body: string;
    word_count: number | null;
    overall: number | null;
    feedback: Record<string, unknown> | null;
    corrections: unknown[];
    teacher_status: string;
    teacher_notes: string | null;
    created_at: string;
  }[];
}

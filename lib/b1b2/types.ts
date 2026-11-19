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

export interface LessonRow {
  id: string;
  module_id: string;
  lesson_number: number;
  module_lesson_number: number;
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
  title: string;
  summary: string;
  topic: string;
  grammar: string[];
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

export interface ContentInput {
  id: string;
  kind: 'listening' | 'reading';
  title: string;
  source_label: string;
  accent: string | null;
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

export interface LessonPayload {
  lesson: LessonRow;
  module: ModuleSummary;
  blocks: LessonBlock[];
  items: PracticeItem[];
  input: ContentInput | null;
  speaking: SpeakingTask | null;
  writing: WritingTask | null;
  progress: LessonProgressRow | null;
}

export interface OutlineLesson {
  id: string;
  number: number;
  module_lesson: number;
  title: string;
  objective: string;
  can_do: string;
  skill: SkillArea;
  status: LessonStatus;
  practice_correct: number | null;
  practice_total: number | null;
  completed_at: string | null;
}

export interface OutlineModule {
  id: string;
  number: number;
  title: string;
  summary: string;
  topic: string;
  grammar: string[];
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
  completed_at: string | null;
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
  weekly_hours: number;
  duration_weeks: number | null;
  daily_minutes_min: number;
  daily_minutes_max: number;
  daily_flow: { block: string; minutes: number; label: string; description: string }[];
  skill_balance: { skill: string; hours: number }[];
}

export interface CurriculumOutline {
  course: CourseRow | null;
  modules: OutlineModule[];
  skills: Record<string, number>;
  due_cards: number;
  checkpoints: OutlineCheckpoint[];
}

/* ------------------------------------------------------------------ */
/* Scoring, checkpoints, learner dashboard                             */
/* ------------------------------------------------------------------ */

export interface Evaluation {
  overall: number;
  scores: Record<string, number>;
  feedback: string;
  strengths: string[];
  improvements: string[];
  transcript?: string;
  corrected?: string;
  model?: string;
}

export interface CheckpointTaskSpec {
  kind: string;
  title: string;
  detail: string;
  minutes: number;
}

export interface CheckpointRow {
  id: string;
  code: string;
  title: string;
  timing_label: string;
  description: string;
  tasks: CheckpointTaskSpec[];
  duration_minutes: number;
  skills: SkillArea[];
  module_id: string | null;
}

export interface CheckpointAttempt {
  id: string;
  status: string;
  scores: Record<string, number>;
  result: {
    overall: number | null;
    band: string;
    quiz_correct: number;
    quiz_total: number;
    quiz_percent: number | null;
  } | null;
  completed_at: string | null;
}

export interface CheckpointPayload {
  checkpoint: CheckpointRow;
  module: { number: number; title: string } | null;
  items: PracticeItem[];
  speaking: SpeakingTask | null;
  writing: WritingTask | null;
  attempt: CheckpointAttempt | null;
}

export interface BadgeRow {
  id: string;
  code: string;
  title: string;
  description: string;
  icon: string;
  xp_reward: number;
  earned_at?: string | null;
}

export interface LearnerDashboard {
  profile: {
    display_name?: string | null;
    full_name?: string | null;
    xp_total?: number;
    learner_band?: string;
    streak_days?: number;
  } | null;
  xp_total: number | null;
  learner_band: string | null;
  streak_days: number | null;
  skills: Record<string, { score: number; lessons: number }>;
  due_cards: number;
  lessons_completed: number;
  next_lesson: { lesson_number: number; title: string; can_do: string; module_title: string } | null;
  badges: { code: string; title: string; earned_at: string }[];
}

export interface WeeklyReport {
  id: string;
  week_start: string;
  study_minutes: number | null;
  words_learned: number | null;
  recordings: number | null;
  writing_tasks: number | null;
  weakest_skill: SkillArea | null;
  payload: Record<string, unknown> | null;
}

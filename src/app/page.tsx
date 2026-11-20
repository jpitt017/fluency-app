import Link from 'next/link';
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  Flame,
  Headphones,
  Layers,
  Mic,
  PenLine,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { formatBandLabel, loadDashboard, loadOutline } from '@/lib/b1b2/data';
import type { SkillArea } from '@/lib/b1b2/types';

export const dynamic = 'force-dynamic';

const DAILY_FLOW_FALLBACK = [
  { block: 'warm_up', minutes: 3, label: 'Warm-up', description: 'Recall 5–10 spaced-repetition vocabulary cards.' },
  { block: 'input', minutes: 8, label: 'Input', description: 'Short grammar explanation, article or multi-accent audio.' },
  { block: 'practice', minutes: 10, label: 'Practice', description: 'Interactive drills on target grammar and collocations.' },
  { block: 'output', minutes: 10, label: 'Output', description: 'Guided voice recording, writing draft or role-play.' },
  { block: 'feedback', minutes: 4, label: 'Feedback', description: 'Line-by-line B2 edits saved to your mistake queue.' },
];

const SKILL_HOURS_FALLBACK = [
  { skill: 'Listening', hours: 12 },
  { skill: 'Speaking', hours: 12 },
  { skill: 'Grammar', hours: 10 },
  { skill: 'Reading', hours: 10 },
  { skill: 'Writing', hours: 10 },
  { skill: 'Vocabulary', hours: 8 },
  { skill: 'Checkpoints', hours: 2 },
];

const FALLBACK_MODULES = [
  { number: 1, title: 'Everyday fluency', summary: 'Life history, routines, personality and change.', lesson_start: 1, lesson_end: 8, hours: 8, grammar: ['Present perfect vs. past simple', 'Narrative tenses'] },
  { number: 2, title: 'Work and study', summary: 'Careers, education and talking accurately about the future.', lesson_start: 9, lesson_end: 16, hours: 8, grammar: ['Future forms', 'First & second conditionals'] },
  { number: 3, title: 'Travel and culture', summary: 'Places, traditions, slow travel and balanced descriptions.', lesson_start: 17, lesson_end: 24, hours: 8, grammar: ['Passive voice', 'Relative clauses'] },
  { number: 4, title: 'Technology and media', summary: 'News, digital habits, reporting views and critical reading.', lesson_start: 25, lesson_end: 32, hours: 8, grammar: ['Modals of deduction', 'Reported speech'] },
  { number: 5, title: 'Environment and society', summary: 'Urban solutions, causes, regrets and structured reports.', lesson_start: 33, lesson_end: 40, hours: 8, grammar: ['Third & mixed conditionals', 'Wish / if only'] },
  { number: 6, title: 'Health and ethics', summary: 'Wellbeing, public policy, weighing evidence and essays.', lesson_start: 41, lesson_end: 48, hours: 8, grammar: ['Causatives', 'Contrast & concession'] },
  { number: 7, title: 'Persuasion and debate', summary: 'Making a case, formal proposals and polite rebuttal.', lesson_start: 49, lesson_end: 56, hours: 8, grammar: ['Inversion', 'Hedging'] },
  { number: 8, title: 'B2 consolidation', summary: 'Integrated reading, multi-accent listening and capstone.', lesson_start: 57, lesson_end: 64, hours: 8, grammar: ['Aspect review', 'B2 precision'] },
];

const MODULE_ACCENTS = [
  'from-indigo-600 to-indigo-400',
  'from-sky-600 to-cyan-400',
  'from-emerald-600 to-teal-400',
  'from-amber-500 to-orange-400',
  'from-rose-600 to-pink-400',
  'from-violet-600 to-purple-400',
  'from-blue-600 to-indigo-400',
  'from-teal-600 to-emerald-400',
];

const BLOCK_ICONS: Record<string, typeof Layers> = {
  warm_up: Layers,
  input: Headphones,
  practice: CheckCircle2,
  output: Mic,
  feedback: Sparkles,
};

const LIVE_SKILLS: { key: SkillArea; label: string; href: string; icon: typeof BookOpen }[] = [
  { key: 'grammar', label: 'Grammar', href: '/review', icon: Sparkles },
  { key: 'vocabulary', label: 'Vocabulary', href: '/vocabulary', icon: Layers },
  { key: 'listening', label: 'Listening', href: '/labs', icon: Headphones },
  { key: 'reading', label: 'Reading', href: '/curriculum', icon: BookOpen },
  { key: 'speaking', label: 'Speaking', href: '/labs', icon: Mic },
  { key: 'writing', label: 'Writing', href: '/labs', icon: PenLine },
];

export default async function Home() {
  const [outline, dashState] = await Promise.all([loadOutline(), loadDashboard()]);
  const { signedIn, dashboard, weeklyGoalHours, telemetry } = dashState;

  const course = outline?.course ?? null;
  const modules = outline?.modules ?? [];
  const checkpoints = outline?.checkpoints ?? [];
  const dailyFlow = course?.daily_flow?.length ? course.daily_flow : DAILY_FLOW_FALLBACK;
  const skillBalance = course?.skill_balance?.length
    ? course.skill_balance.map((item) => ({
        skill: item.skill.charAt(0).toUpperCase() + item.skill.slice(1),
        hours: item.hours,
      }))
    : SKILL_HOURS_FALLBACK;

  // Signed-in learner metrics
  const lessonsCompleted = dashboard?.lessons_completed ?? 0;
  const streakDays = dashboard?.streak_days ?? 0;
  const dueCards = dashboard?.due_cards ?? 0;
  const dueErrors = telemetry.dueErrorCards + telemetry.missedPracticeCount;
  const nextLesson = dashboard?.next_lesson ?? null;
  const recommendedLessonNum =
    lessonsCompleted === 0 && telemetry.placementRecommendation?.recommended_lesson
      ? telemetry.placementRecommendation.recommended_lesson
      : nextLesson?.lesson_number ?? 1;
  const progressPct = Math.min(100, Math.round((lessonsCompleted / 64) * 100));
  const ringCircumference = 2 * Math.PI * 24;
  const ringOffset = ringCircumference - (progressPct / 100) * ringCircumference;

  const liveSkills = LIVE_SKILLS.map((s) => ({
    ...s,
    score: Math.round(Number(dashboard?.skills?.[s.key]?.score ?? 0)),
  }));
  const weakestSkill =
    liveSkills.length > 0
      ? liveSkills.reduce((min, cur) => (cur.score < min.score ? cur : min), liveSkills[0])
      : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-9">
      {signedIn ? (
        /* Signed-in Command Center */
        <section className="grid gap-6 lg:grid-cols-12 lg:items-start">
          <div className="space-y-5 rounded-2xl border border-stone-200/90 bg-white p-6 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_10px_28px_-14px_rgba(24,24,27,0.08)] lg:col-span-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="relative hidden h-14 w-14 shrink-0 items-center justify-center sm:flex">
                  <svg className="h-14 w-14 -rotate-90" viewBox="0 0 60 60" aria-hidden="true">
                    <circle cx="30" cy="30" r="24" fill="none" stroke="#f5f5f4" strokeWidth="5.5" />
                    <circle
                      cx="30"
                      cy="30"
                      r="24"
                      fill="none"
                      stroke="#4338ca"
                      strokeWidth="5.5"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringOffset}
                    />
                  </svg>
                  <span className="absolute font-mono text-[11px] font-bold text-stone-900">{progressPct}%</span>
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                    <span className="rounded-full bg-indigo-700 px-2.5 py-0.5 text-white">
                      {formatBandLabel(dashboard?.learner_band)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-800">
                      <Flame className="h-3 w-3" />
                      {streakDays}d streak
                    </span>
                    <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-stone-700">
                      {lessonsCompleted}/64 lessons · {weeklyGoalHours}h/wk
                    </span>
                  </div>
                  <h1 className="mt-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-stone-900 sm:text-[1.75rem]">
                    {lessonsCompleted === 0 && telemetry.placementRecommendation?.recommended_lesson
                      ? `Placement Match: Start at Lesson ${recommendedLessonNum}`
                      : nextLesson
                        ? `Lesson ${nextLesson.lesson_number}: ${nextLesson.title}`
                        : 'All 64 B1 → B2 Lessons Completed'}
                  </h1>
                  <p className="mt-1 text-xs leading-5 text-stone-600 sm:text-sm">
                    {nextLesson
                      ? `${nextLesson.module_title} — ${nextLesson.can_do}`
                      : 'Review your assessment portfolio or drill any skill in the AI Output Studio.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href={`/curriculum/lessons/${recommendedLessonNum}`}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-950/15 transition hover:-translate-y-0.5 hover:bg-indigo-800"
              >
                <span>{lessonsCompleted === 0 ? `Start Lesson ${recommendedLessonNum}` : `Resume Lesson ${recommendedLessonNum}`}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
              >
                <span>Full Dashboard</span>
              </Link>
              <Link
                href="/labs"
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
              >
                <Mic className="h-4 w-4 text-indigo-700" />
                <span>AI Labs</span>
              </Link>
            </div>

            {/* Today's 3-Step Daily Queue */}
            <div className="grid gap-2.5 border-t border-stone-100 pt-4 sm:grid-cols-3">
              <Link
                href="/vocabulary"
                className="group rounded-xl border border-stone-200/80 bg-stone-50/70 p-3 transition hover:border-indigo-300 hover:bg-indigo-50/30"
              >
                <div className="flex items-center justify-between text-xs font-bold text-stone-800">
                  <span className="inline-flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-emerald-700" />
                    1. Vocab SRS
                  </span>
                  <ArrowRight className="h-3 w-3 text-stone-400 group-hover:text-indigo-700" />
                </div>
                <p className="mt-1 text-[11px] text-stone-600">
                  {dueCards > 0 ? `${dueCards} cards due today` : `${telemetry.activeVocabMastered}/${telemetry.activeVocabTotal || 84} retained`}
                </p>
              </Link>

              <Link
                href="/review"
                className="group rounded-xl border border-stone-200/80 bg-stone-50/70 p-3 transition hover:border-amber-300 hover:bg-amber-50/30"
              >
                <div className="flex items-center justify-between text-xs font-bold text-stone-800">
                  <span className="inline-flex items-center gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5 text-amber-700" />
                    2. Error Drill
                  </span>
                  <ArrowRight className="h-3 w-3 text-stone-400 group-hover:text-amber-700" />
                </div>
                <p className="mt-1 text-[11px] text-stone-600">
                  {dueErrors > 0 ? `${dueErrors} repairs due` : 'Queue clear right now'}
                </p>
              </Link>

              <Link
                href={`/curriculum/lessons/${recommendedLessonNum}`}
                className="group rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 transition hover:border-indigo-400"
              >
                <div className="flex items-center justify-between text-xs font-bold text-indigo-950">
                  <span className="inline-flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-indigo-700" />
                    3. Lesson {recommendedLessonNum}
                  </span>
                  <ArrowRight className="h-3 w-3 text-indigo-600" />
                </div>
                <p className="mt-1 text-[11px] text-indigo-800/80">5-block study loop</p>
              </Link>
            </div>

            {/* Adaptive Error Focus Snippet */}
            {telemetry.recurringErrors.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/70 bg-amber-50/40 px-3.5 py-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold text-amber-950">Top patterns:</span>
                  {telemetry.recurringErrors.slice(0, 3).map((e) => (
                    <span
                      key={e.tag}
                      className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-stone-700 ring-1 ring-amber-200/80"
                    >
                      {e.label} ({e.count}×)
                    </span>
                  ))}
                </div>
                <Link href="/review" className="font-semibold text-indigo-700 hover:underline">
                  Practise →
                </Link>
              </div>
            )}
          </div>

          {/* Right Panel: Live Skill Mastery + Output Snapshots */}
          <aside className="space-y-4 rounded-2xl border border-stone-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_12px_32px_-16px_rgba(24,24,27,0.08)] lg:col-span-5">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Live Mastery</p>
                <h2 className="font-serif text-lg font-semibold text-stone-900">Six Skill Meters</h2>
              </div>
              {weakestSkill && (
                <Link
                  href={weakestSkill.href}
                  className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200/80 hover:bg-amber-100"
                >
                  Focus: {weakestSkill.label} →
                </Link>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {liveSkills.map(({ key, label, href, icon: Icon, score }) => {
                const isWeakest = weakestSkill?.key === key && score < 85;
                return (
                  <Link
                    key={key}
                    href={href}
                    className={`rounded-xl border p-2.5 transition hover:border-indigo-300 ${
                      isWeakest ? 'border-amber-200 bg-amber-50/30' : 'border-stone-100 bg-stone-50/70'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1 font-semibold text-stone-800">
                        <Icon className="h-3.5 w-3.5 text-indigo-600" />
                        {label}
                      </span>
                      <span className="font-mono font-bold text-indigo-700">{score}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-stone-200/70">
                      <div
                        className={`h-full rounded-full ${isWeakest ? 'bg-amber-500' : 'bg-indigo-600'}`}
                        style={{ width: `${Math.min(100, Math.max(4, score))}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2.5 border-t border-stone-100 pt-3">
              <Link href="/portfolio" className="rounded-xl bg-stone-50 p-3 transition hover:bg-stone-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Latest Speaking</p>
                <p className="mt-0.5 font-serif text-xl font-semibold text-stone-900">
                  {telemetry.speakingLatest !== null ? `${telemetry.speakingLatest}%` : '—'}
                </p>
                <p className="text-[11px] text-stone-500">
                  {telemetry.speakingCount > 0 ? `${telemetry.speakingCount} evaluated` : 'Open Speaking Lab'}
                </p>
              </Link>
              <Link href="/portfolio" className="rounded-xl bg-stone-50 p-3 transition hover:bg-stone-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Latest Writing</p>
                <p className="mt-0.5 font-serif text-xl font-semibold text-stone-900">
                  {telemetry.writingLatest !== null ? `${telemetry.writingLatest}%` : '—'}
                </p>
                <p className="text-[11px] text-stone-500">
                  {telemetry.writingCount > 0 ? `${telemetry.writingCount} evaluated` : 'Open Writing Studio'}
                </p>
              </Link>
            </div>
          </aside>
        </section>
      ) : (
        /* Signed-out Crisp Command Overview */
        <section className="grid gap-8 lg:grid-cols-12 lg:items-start">
          <div className="space-y-5 lg:col-span-7">
            <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-stone-200/90 bg-white px-3.5 py-1 text-xs font-semibold text-stone-700 shadow-2xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>CEFR B1 → B2 · Independent User</span>
              <span aria-hidden className="text-stone-300">·</span>
              <span className="text-indigo-700">{course?.total_hours ?? 64} guided hours</span>
            </div>

            <h1 className="font-serif text-3xl font-semibold leading-[1.1] tracking-tight text-stone-900 sm:text-4xl lg:text-[2.85rem]">
              A structured daily workspace to reach{' '}
              <span className="italic text-indigo-700">solid B2 English.</span>
            </h1>

            <p className="max-w-2xl text-sm leading-6 text-stone-600 sm:text-[15px]">
              {course?.description ??
                'Eight themed modules of eight lessons each (64 lessons total) built around FSRS active recall, multi-accent listening, spoken & written output, and targeted AI coaching.'}
            </p>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/onboarding/placement"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-950/15 transition hover:-translate-y-0.5 hover:bg-indigo-800"
              >
                <Compass className="h-4 w-4" />
                <span>3-min Placement Check</span>
              </Link>
              <Link
                href="/curriculum"
                className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-2xs transition hover:border-stone-400 hover:bg-stone-50"
              >
                <span>Explore 64 Lessons</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/labs"
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
              >
                <Mic className="h-4 w-4 text-indigo-700" />
                <span>AI Labs</span>
              </Link>
            </div>

            {/* Interactive Platform Capabilities Strip */}
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Link
                href="/vocabulary"
                className="group rounded-xl border border-stone-200/80 bg-white p-3.5 transition hover:border-indigo-300"
              >
                <div className="flex items-center justify-between text-xs font-bold text-stone-900">
                  <span className="inline-flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-emerald-700" />
                    FSRS Collocation Recall
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-stone-400 group-hover:text-indigo-700" />
                </div>
                <p className="mt-1 text-xs text-stone-600">
                  Cloze prompts, British audio, and spaced scheduling across 84+ B1–B2 chunks.
                </p>
              </Link>

              <Link
                href="/labs"
                className="group rounded-xl border border-stone-200/80 bg-white p-3.5 transition hover:border-indigo-300"
              >
                <div className="flex items-center justify-between text-xs font-bold text-stone-900">
                  <span className="inline-flex items-center gap-1.5">
                    <Mic className="h-3.5 w-3.5 text-rose-700" />
                    Whisper Speaking &amp; Writing Diff
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-stone-400 group-hover:text-indigo-700" />
                </div>
                <p className="mt-1 text-xs text-stone-600">
                  Shadowing waveform studio, B2 rewrites, and line-by-line error tracking.
                </p>
              </Link>
            </div>

            <dl className="grid grid-cols-2 gap-3 border-t border-stone-200/80 pt-4 sm:grid-cols-4">
              <div className="rounded-xl border border-stone-200/70 bg-white/80 p-3">
                <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                  <Clock className="h-3 w-3 text-indigo-600" />
                  <span>Length</span>
                </dt>
                <dd className="mt-1 font-serif text-xl font-semibold text-stone-900">
                  {course?.total_hours ?? 64}h
                </dd>
              </div>
              <div className="rounded-xl border border-stone-200/70 bg-white/80 p-3">
                <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                  <BookOpen className="h-3 w-3 text-indigo-600" />
                  <span>Structure</span>
                </dt>
                <dd className="mt-1 font-serif text-xl font-semibold text-stone-900">8 × 8</dd>
              </div>
              <div className="rounded-xl border border-stone-200/70 bg-white/80 p-3">
                <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                  <PenLine className="h-3 w-3 text-indigo-600" />
                  <span>Daily pace</span>
                </dt>
                <dd className="mt-1 font-serif text-xl font-semibold text-stone-900">
                  {course?.daily_minutes_min ?? 20}–{course?.daily_minutes_max ?? 45}m
                </dd>
              </div>
              <div className="rounded-xl border border-stone-200/70 bg-white/80 p-3">
                <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                  <Award className="h-3 w-3 text-indigo-600" />
                  <span>Checkpoints</span>
                </dt>
                <dd className="mt-1 font-serif text-xl font-semibold text-stone-900">M2·4·6·8</dd>
              </div>
            </dl>
          </div>

          {/* Right Architectural Panel */}
          <aside className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_12px_32px_-16px_rgba(24,24,27,0.08)] lg:col-span-5">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Daily Study Loop</p>
                <h2 className="font-serif text-lg font-semibold text-stone-900">5-Block Lesson Architecture</h2>
              </div>
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                ~35 min
              </span>
            </div>

            <ol className="mt-3 space-y-2">
              {dailyFlow.map((step, idx) => {
                const Icon = BLOCK_ICONS[step.block] ?? BookOpen;
                return (
                  <li
                    key={step.block}
                    className="flex items-start gap-2.5 rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-2 transition hover:border-indigo-200/80 hover:bg-indigo-50/30"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-700 shadow-2xs ring-1 ring-stone-200/80">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-stone-900">
                          {idx + 1}. {step.label}
                        </span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-stone-500 ring-1 ring-stone-200/70">
                          {step.minutes}m
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-4 text-stone-600">{step.description}</p>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="mt-4 border-t border-stone-100 pt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">64-Hour Skill Balance</p>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                {skillBalance.map((item) => (
                  <div key={item.skill} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-stone-700">{item.skill}</span>
                      <span className="font-semibold text-stone-900">{item.hours}h</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full bg-indigo-600"
                        style={{ width: `${Math.min(100, Math.round((item.hours / 12) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      )}

      {/* 8-Module Roadmap (live progress when signed in, clean fallback if outline unavailable) */}
      <section className="mt-10 border-t border-stone-200/80 pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Syllabus</p>
            <h2 className="mt-0.5 font-serif text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
              Eight Modules from B1 to B2
            </h2>
          </div>
          <Link
            href="/curriculum"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:underline"
          >
            <span>Explore all 64 lessons</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(modules.length > 0 ? modules : FALLBACK_MODULES).map((mod, idx) => {
            const lessonsInMod = 'lessons' in mod && Array.isArray(mod.lessons) ? mod.lessons : [];
            const doneCount = lessonsInMod.filter((l) => l.status === 'completed').length;
            const modPct = lessonsInMod.length > 0 ? Math.round((doneCount / lessonsInMod.length) * 100) : 0;
            const nextModLesson = lessonsInMod.find((l) => l.status !== 'completed') ?? lessonsInMod[0];
            const targetLessonNumber = nextModLesson?.number ?? mod.lesson_start;

            return (
              <Link
                key={mod.number}
                href={`/curriculum/lessons/${targetLessonNumber}`}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-stone-200/90 bg-white p-4 shadow-2xs transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
              >
                <span
                  aria-hidden
                  className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${MODULE_ACCENTS[idx % MODULE_ACCENTS.length]}`}
                />
                <div className="pt-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-indigo-700">
                      Module {String(mod.number).padStart(2, '0')}
                    </span>
                    <span className="text-stone-500">
                      {signedIn && lessonsInMod.length > 0
                        ? `${doneCount}/${lessonsInMod.length} done`
                        : `L${mod.lesson_start}–${mod.lesson_end} · ${mod.hours}h`}
                    </span>
                  </div>
                  <h3 className="mt-2.5 text-sm font-bold text-stone-900 transition group-hover:text-indigo-700">
                    {mod.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-600">{mod.summary}</p>
                </div>

                <div className="mt-3 space-y-2 border-t border-stone-100 pt-2.5">
                  {signedIn && lessonsInMod.length > 0 && (
                    <div className="h-1 overflow-hidden rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-indigo-600" style={{ width: `${modPct}%` }} />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {mod.grammar.slice(0, 2).map((g) => (
                      <span key={g} className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-700">
                        {g}
                      </span>
                    ))}
                    {mod.number % 2 === 0 && (
                      <span className="ml-auto rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                        Checkpoint
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Checkpoints */}
      {checkpoints.length > 0 && (
        <section className="mt-10 rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Progress Gates</p>
              <h2 className="mt-0.5 font-serif text-2xl font-semibold text-stone-900">
                Four Assessment Checkpoints
              </h2>
            </div>
            <Link
              href="/checkpoints"
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline"
            >
              <span>Open checkpoint runner</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {checkpoints.map((cp) => (
              <Link
                key={cp.code}
                href={`/checkpoints/${cp.code}`}
                className="group rounded-xl border border-stone-200/80 bg-stone-50/70 p-4 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-indigo-700">{cp.timing}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-700" />
                </div>
                <p className="mt-1.5 text-sm font-bold text-stone-900">{cp.title}</p>
                <p className="mt-1 text-xs leading-5 text-stone-600">{cp.description}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

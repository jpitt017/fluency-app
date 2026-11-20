import Link from 'next/link';
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Compass,
  Headphones,
  Layers,
  Mic,
  PenLine,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { WeeklyPaceSelector, WeeklyReportCard } from '@/components/b1b2/DashboardControls';
import { formatBandLabel, loadDashboard, loadObservabilitySummary, loadOutline } from '@/lib/b1b2/data';
import type { SkillArea } from '@/lib/b1b2/types';

export const dynamic = 'force-dynamic';

const SKILLS: {
  key: SkillArea;
  label: string;
  targetHours: number;
  href: string;
  cta: string;
  icon: typeof BookOpen;
}[] = [
  { key: 'grammar', label: 'Grammar', targetHours: 10, href: '/review', cta: 'Drill grammar', icon: Sparkles },
  { key: 'vocabulary', label: 'Vocabulary', targetHours: 8, href: '/vocabulary', cta: 'Review SRS', icon: Layers },
  { key: 'listening', label: 'Listening', targetHours: 12, href: '/labs', cta: 'Shadow audio', icon: Headphones },
  { key: 'reading', label: 'Reading', targetHours: 10, href: '/curriculum', cta: 'Open texts', icon: BookOpen },
  { key: 'speaking', label: 'Speaking', targetHours: 12, href: '/labs', cta: 'Speaking lab', icon: Mic },
  { key: 'writing', label: 'Writing', targetHours: 10, href: '/labs', cta: 'Writing studio', icon: PenLine },
];

export default async function DashboardPage() {
  const [{ signedIn, dashboard, recentXp, weeklyGoalHours, weeklyReport, subscriptionStatus, telemetry }, outline, obs] =
    await Promise.all([loadDashboard(), loadOutline(), loadObservabilitySummary(7)]);

  if (!signedIn) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_12px_32px_-16px_rgba(24,24,27,0.08)]">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">Study Workspace</span>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-stone-900">
            Sign in to open your B1 → B2 dashboard
          </h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Track all 64 lessons, review your spaced-repetition vocabulary deck, monitor six skill meters, and save AI speaking and writing feedback.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/login?next=/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-800"
            >
              <span>Sign in</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/curriculum"
              className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              Preview curriculum
            </Link>
            <Link
              href="/onboarding/placement"
              className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              Placement check
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const lessonsCompleted = dashboard?.lessons_completed ?? 0;
  const remainingLessons = Math.max(0, 64 - lessonsCompleted);
  const streakDays = dashboard?.streak_days ?? 0;
  const dueCards = dashboard?.due_cards ?? 0;
  const totalReviewQueue = telemetry.dueErrorCards + telemetry.missedPracticeCount;
  const bandLabel = formatBandLabel(dashboard?.learner_band);
  const nextLesson = dashboard?.next_lesson;
  const modules = outline?.modules ?? [];
  const checkpoints = outline?.checkpoints ?? [];
  const badges = dashboard?.badges ?? [];

  const recommendedLessonNum =
    lessonsCompleted === 0 && telemetry.placementRecommendation?.recommended_lesson
      ? telemetry.placementRecommendation.recommended_lesson
      : nextLesson?.lesson_number ?? 1;

  const progressPct = Math.min(100, Math.round((lessonsCompleted / 64) * 100));
  const ringCircumference = 2 * Math.PI * 26;
  const ringOffset = ringCircumference - (progressPct / 100) * ringCircumference;

  const vocabTotal = telemetry.activeVocabTotal || 84;
  const vocabMasteredPct = Math.min(100, Math.round((telemetry.activeVocabMastered / Math.max(1, vocabTotal)) * 100));

  const skillEntries = SKILLS.map((s) => ({
    ...s,
    score: Math.round(Number(dashboard?.skills?.[s.key]?.score ?? 0)),
  }));
  const weakestSkill =
    skillEntries.length > 0
      ? skillEntries.reduce((min, cur) => (cur.score < min.score ? cur : min), skillEntries[0])
      : null;

  const wordBaselinePct = Math.min(
    100,
    Math.round((telemetry.totalWordsEvaluated / Math.max(1, telemetry.minWordsRequired)) * 100),
  );

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      {/* Hero Workspace + Today's Study Queue */}
      <section className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_10px_28px_-14px_rgba(24,24,27,0.08)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="relative hidden h-16 w-16 shrink-0 items-center justify-center sm:flex">
              <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="32" r="26" fill="none" stroke="#f5f5f4" strokeWidth="6" />
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  fill="none"
                  stroke="#4338ca"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                />
              </svg>
              <span className="absolute font-mono text-xs font-bold text-stone-900">{progressPct}%</span>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="rounded-full bg-indigo-700 px-2.5 py-0.5 text-white">{bandLabel}</span>
                <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-stone-700">
                  {weeklyGoalHours}h / week target
                </span>
                <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-stone-700">
                  {streakDays}d streak
                </span>
                {subscriptionStatus === 'active' || subscriptionStatus === 'trialing' ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-emerald-800">Pro Member</span>
                ) : (
                  <Link href="/pricing" className="rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-800 hover:underline">
                    Core free · Upgrade →
                  </Link>
                )}
              </div>
              <h1 className="font-serif text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
                {lessonsCompleted === 0 && telemetry.placementRecommendation?.recommended_lesson
                  ? `Placement Match: Start at Lesson ${recommendedLessonNum}`
                  : nextLesson
                    ? `Up next: Lesson ${nextLesson.lesson_number} — ${nextLesson.title}`
                    : 'English B1 → B2 Study Workspace'}
              </h1>
              <p className="text-sm text-stone-600">
                {nextLesson
                  ? `${nextLesson.module_title} · ${nextLesson.can_do}`
                  : 'All 64 lessons completed! Review your checkpoints or practise in the AI Labs.'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2.5">
            <Link
              href={`/curriculum/lessons/${recommendedLessonNum}`}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-950/15 transition hover:-translate-y-0.5 hover:bg-indigo-800"
            >
              <span>
                {lessonsCompleted === 0 && telemetry.placementRecommendation?.recommended_lesson
                  ? `Start Lesson ${recommendedLessonNum}`
                  : nextLesson
                    ? `Resume Lesson ${nextLesson.lesson_number}`
                    : 'Open Curriculum'}
              </span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/labs"
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-800 shadow-2xs transition hover:bg-stone-50"
            >
              <Mic className="h-4 w-4 text-indigo-700" />
              <span>AI Labs</span>
            </Link>
          </div>
        </div>

        {/* Today's 3-Step Daily Queue */}
        <div className="mt-5 grid gap-3 border-t border-stone-100 pt-5 sm:grid-cols-3">
          <Link
            href="/vocabulary"
            className="group flex items-center justify-between rounded-xl border border-stone-200/80 bg-stone-50/70 px-4 py-3 transition hover:border-indigo-300 hover:bg-indigo-50/40"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Layers className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-bold text-stone-900">1. Vocab Warm-up</p>
                <p className="text-[11px] text-stone-500">
                  {dueCards > 0 ? `${dueCards} SRS cards due (~4m)` : 'Deck caught up · free review'}
                </p>
              </div>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-700" />
          </Link>

          <Link
            href="/review"
            className="group flex items-center justify-between rounded-xl border border-stone-200/80 bg-stone-50/70 px-4 py-3 transition hover:border-amber-300 hover:bg-amber-50/40"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                <RotateCcw className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-bold text-stone-900">2. Mistake Repair</p>
                <p className="text-[11px] text-stone-500">
                  {totalReviewQueue > 0 ? `${totalReviewQueue} items due (~5m)` : '0 cards due right now'}
                </p>
              </div>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-amber-800" />
          </Link>

          <Link
            href={`/curriculum/lessons/${recommendedLessonNum}`}
            className="group flex items-center justify-between rounded-xl border border-indigo-200/90 bg-indigo-50/50 px-4 py-3 transition hover:border-indigo-400 hover:bg-indigo-50"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-700 text-white">
                <BookOpen className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-bold text-indigo-950">3. Core Lesson</p>
                <p className="text-[11px] text-indigo-800/80">
                  Lesson {recommendedLessonNum} · ~35 min loop
                </p>
              </div>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-indigo-600 transition group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      {/* 4 Skill-Focused KPIs */}
      <section aria-label="Skill telemetry" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/curriculum"
          className="group block rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Guided Curriculum</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <BookOpen className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 font-serif text-3xl font-semibold text-stone-900">
            {lessonsCompleted} <span className="font-sans text-base font-medium text-stone-400">/ 64</span>
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-indigo-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mt-2 flex items-center justify-between text-xs text-stone-500">
            <span>{remainingLessons}h remaining</span>
            <span className="font-semibold text-indigo-700 group-hover:underline">Syllabus →</span>
          </p>
        </Link>

        <Link
          href="/vocabulary"
          className="group block rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Retained Vocabulary</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Layers className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 font-serif text-3xl font-semibold text-stone-900">
            {telemetry.activeVocabMastered}{' '}
            <span className="font-sans text-base font-medium text-stone-400">/ {vocabTotal}</span>
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600"
              style={{ width: `${vocabMasteredPct}%` }}
            />
          </div>
          <p className="mt-2 flex items-center justify-between text-xs text-stone-500">
            <span>{dueCards} due today</span>
            <span className="font-semibold text-indigo-700 group-hover:underline">Open SRS →</span>
          </p>
        </Link>

        <Link
          href="/portfolio"
          className="group block rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Speaking Growth</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-700">
              <Mic className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 font-serif text-3xl font-semibold text-stone-900">
            {telemetry.speakingLatest !== null ? `${telemetry.speakingLatest}%` : '—'}
          </p>
          <p className="mt-2 flex items-center justify-between text-xs text-stone-500">
            <span>
              {telemetry.speakingCount > 0
                ? `${telemetry.speakingCount} evaluated${
                    telemetry.speakingDelta !== null
                      ? ` (${telemetry.speakingDelta >= 0 ? `+${telemetry.speakingDelta}` : telemetry.speakingDelta}%)`
                      : ''
                  }`
                : 'Record 1st clip in Labs'}
            </span>
            <span className="font-semibold text-indigo-700 group-hover:underline">Archive →</span>
          </p>
        </Link>

        <Link
          href="/portfolio"
          className="group block rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Writing Growth</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <PenLine className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 font-serif text-3xl font-semibold text-stone-900">
            {telemetry.writingLatest !== null ? `${telemetry.writingLatest}%` : '—'}
          </p>
          <p className="mt-2 flex items-center justify-between text-xs text-stone-500">
            <span>
              {telemetry.writingCount > 0
                ? `${telemetry.writingCount} evaluated${
                    telemetry.writingDelta !== null
                      ? ` (${telemetry.writingDelta >= 0 ? `+${telemetry.writingDelta}` : telemetry.writingDelta}%)`
                      : ''
                  }`
                : 'Submit 1st draft in Labs'}
            </span>
            <span className="font-semibold text-indigo-700 group-hover:underline">Archive →</span>
          </p>
        </Link>
      </section>

      {/* 8-Module Course Journey Strip */}
      {modules.length > 0 && (
        <section aria-label="Module progress" className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-serif text-lg font-semibold text-stone-900">8-Module B1 → B2 Roadmap</h2>
              <p className="text-xs text-stone-500">
                Click any module to jump straight into its next incomplete lesson.
              </p>
            </div>
            <Link href="/curriculum" className="text-xs font-semibold text-indigo-700 hover:underline">
              Full 64-lesson view →
            </Link>
          </div>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map((mod) => {
              const done = mod.lessons.filter((l) => l.status === 'completed').length;
              const pct = Math.round((done / Math.max(1, mod.lessons.length)) * 100);
              const nextModLesson = mod.lessons.find((l) => l.status !== 'completed') ?? mod.lessons[0];
              const isCurrent = Boolean(
                nextLesson && nextLesson.lesson_number >= mod.lesson_start && nextLesson.lesson_number <= mod.lesson_end,
              );
              const isComplete = done === mod.lessons.length && mod.lessons.length > 0;
              return (
                <Link
                  key={mod.id}
                  href={`/curriculum/lessons/${nextModLesson?.number ?? mod.lesson_start}`}
                  className={`rounded-xl border p-3 transition hover:-translate-y-0.5 ${
                    isCurrent
                      ? 'border-indigo-400 bg-indigo-50/40 ring-1 ring-indigo-100'
                      : isComplete
                        ? 'border-emerald-200 bg-emerald-50/30'
                        : 'border-stone-200/80 bg-stone-50/50 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold">
                    <span className={isCurrent ? 'text-indigo-800' : 'text-stone-500'}>
                      Module {mod.number}
                      {mod.number % 2 === 0 ? ' · Checkpoint' : ''}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono text-stone-700">
                      {isComplete && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                      {done}/{mod.lessons.length || 8}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs font-bold text-stone-900">{mod.title}</p>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-200/70">
                    <div
                      className={`h-full rounded-full ${isComplete ? 'bg-emerald-600' : 'bg-indigo-600'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Main 2-Column Editorial Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Adaptive Error Focus + Six Skill Meters + Recent Study Log */}
        <div className="space-y-6 lg:col-span-7">
          <section className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-serif text-xl font-semibold text-stone-900">
                  Adaptive Focus &amp; Error Density
                </h2>
                <p className="mt-0.5 text-xs text-stone-500">
                  Normalized per 100 words written or spoken · {telemetry.masteredErrorCards} repair cards mastered
                </p>
              </div>
              <div className="flex items-center gap-2">
                {telemetry.hasEnoughWordData && telemetry.errorsPer100Words !== null ? (
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-800">
                    {telemetry.errorsPer100Words} / 100w
                    {telemetry.hasEnoughTrendData && telemetry.errorsPer100WordsDelta !== null
                      ? ` (${telemetry.errorsPer100WordsDelta <= 0 ? telemetry.errorsPer100WordsDelta : `+${telemetry.errorsPer100WordsDelta}`})`
                      : ''}
                  </span>
                ) : (
                  <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-semibold text-stone-600">
                    Baseline: {telemetry.totalWordsEvaluated}/{telemetry.minWordsRequired} words
                  </span>
                )}
                <Link href="/review" className="text-xs font-semibold text-indigo-700 hover:underline">
                  Drill mistakes →
                </Link>
              </div>
            </div>

            {!telemetry.hasEnoughWordData && (
              <div className="mt-3 rounded-xl border border-stone-100 bg-stone-50/80 p-3">
                <div className="flex items-center justify-between text-[11px] font-medium text-stone-600">
                  <span>Collecting 200-word speaking &amp; writing sample for reliable error-rate tracking</span>
                  <span className="font-mono font-semibold text-stone-800">{wordBaselinePct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-stone-200/70">
                  <div className="h-full rounded-full bg-indigo-600" style={{ width: `${wordBaselinePct}%` }} />
                </div>
              </div>
            )}

            {telemetry.recurringErrors.length > 0 ? (
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {telemetry.recurringErrors.map((err) => (
                  <Link
                    key={err.tag}
                    href="/review"
                    className="flex items-center justify-between gap-2 rounded-xl border border-amber-200/80 bg-amber-50/40 px-3.5 py-2.5 text-xs transition hover:border-amber-300"
                  >
                    <div className="min-w-0">
                      <span className="block truncate font-semibold text-stone-800">{err.label}</span>
                      <span className="text-[11px] text-stone-500">
                        {telemetry.hasEnoughWordData
                          ? `${err.per100Words} / 100 words${
                              telemetry.hasEnoughTrendData && err.per100WordsPrev !== null
                                ? ` (prev ${err.per100WordsPrev})`
                                : ''
                            }`
                          : `${err.count}× logged`}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${
                        telemetry.hasEnoughTrendData && err.trend === 'improving'
                          ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                          : telemetry.hasEnoughTrendData && err.trend === 'worsening'
                            ? 'bg-rose-50 text-rose-800 ring-rose-200'
                            : 'bg-white text-amber-800 ring-amber-200'
                      }`}
                    >
                      {telemetry.hasEnoughTrendData && err.trend === 'improving'
                        ? '↓ improving'
                        : telemetry.hasEnoughTrendData && err.trend === 'worsening'
                          ? '↑ watch'
                          : `${err.count}×`}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-stone-100 bg-stone-50/80 p-3.5 text-xs leading-5 text-stone-600">
                {telemetry.missedPracticeCount > 0
                  ? `You have ${telemetry.missedPracticeCount} missed practice items ready for active recall review.`
                  : 'Complete lessons and AI speaking/writing tasks to populate your personalised error ledger.'}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-serif text-xl font-semibold text-stone-900">Six Skill Meters</h2>
                <p className="mt-0.5 text-xs text-stone-500">
                  {weakestSkill
                    ? `Priority focus: ${weakestSkill.label} (${weakestSkill.score}%)`
                    : 'Balanced coverage across all 64 guided hours.'}
                </p>
              </div>
              <Link href="/curriculum" className="text-xs font-semibold text-indigo-700 hover:underline">
                View syllabus →
              </Link>
            </div>

            <div className="mt-5 grid gap-3.5 sm:grid-cols-2">
              {skillEntries.map(({ key, label, targetHours, href, cta, icon: Icon, score }) => {
                const isPriority = weakestSkill?.key === key && score < 85;
                return (
                  <Link
                    key={key}
                    href={href}
                    className={`group rounded-xl border p-3.5 transition hover:border-indigo-300 ${
                      isPriority ? 'border-amber-200 bg-amber-50/30' : 'border-stone-100 bg-stone-50/80'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-stone-800">
                        <Icon className="h-3.5 w-3.5 text-indigo-600" />
                        <span>{label}</span>
                        {isPriority && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                            Focus
                          </span>
                        )}
                      </span>
                      <span className="font-mono font-semibold text-indigo-700">
                        {score}% · {targetHours}h
                      </span>
                    </div>
                    <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white ring-1 ring-stone-200/70">
                      <div
                        className={`h-full rounded-full ${isPriority ? 'bg-amber-500' : 'bg-gradient-to-r from-indigo-600 to-indigo-700'}`}
                        style={{ width: `${Math.min(100, Math.max(3, score))}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[11px] font-semibold text-indigo-700 opacity-80 group-hover:opacity-100">
                      {cta} →
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs">
            <h2 className="font-serif text-xl font-semibold text-stone-900">Recent Study Log</h2>
            {recentXp.length > 0 ? (
              <ul className="mt-4 divide-y divide-stone-100">
                {recentXp.map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-stone-800">
                        {event.note || event.source.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-stone-500">
                        {new Date(event.created_at).toLocaleDateString()} · {event.source.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                      +{event.points} XP
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-stone-500">
                Complete your first lesson, contextual vocab review, or AI output evaluation to log study sessions.
              </p>
            )}
          </section>
        </div>

        {/* Right: Study Pace + Weekly Report + Checkpoints + Badges + Account */}
        <div className="space-y-6 lg:col-span-5">
          <WeeklyPaceSelector currentHours={weeklyGoalHours} remainingLessons={remainingLessons} />

          <WeeklyReportCard report={weeklyReport} />

          <section className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-serif text-xl font-semibold text-stone-900">Assessment Checkpoints</h2>
              <Link href="/checkpoints" className="text-xs font-semibold text-indigo-700 hover:underline">
                View all →
              </Link>
            </div>
            <p className="mt-0.5 text-xs text-stone-500">Four milestone evaluations across Modules 2, 4, 6 &amp; 8.</p>
            <div className="mt-4 space-y-2.5">
              {checkpoints.map((cp) => (
                <Link
                  key={cp.code}
                  href={`/checkpoints/${cp.code}`}
                  className="flex items-start justify-between gap-3 rounded-xl border border-stone-200/80 bg-stone-50/70 p-3.5 transition hover:border-indigo-300 hover:bg-indigo-50/30"
                >
                  <div>
                    <p className="text-xs font-semibold text-indigo-700">{cp.timing}</p>
                    <p className="text-sm font-bold text-stone-900">{cp.title}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      cp.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-white text-stone-600 ring-1 ring-stone-200'
                    }`}
                  >
                    {cp.status === 'completed' ? 'Passed' : 'Start →'}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold text-stone-900">Milestones &amp; Quick Tools</h2>
              <Award className="h-4 w-4 text-emerald-700" />
            </div>
            {badges.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {badges.map((badge) => (
                  <li
                    key={badge.code}
                    className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 px-3.5 py-2.5 text-sm"
                  >
                    <span className="font-semibold text-stone-900">{badge.title}</span>
                    <span className="text-xs text-emerald-700">
                      {new Date(badge.earned_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs leading-5 text-stone-500">
                Milestones unlock automatically as you record 2-minute monologues, revise writing drafts, and retain collocations.
              </p>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-stone-100 pt-4">
              <Link
                href="/labs"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100"
              >
                <Mic className="h-3.5 w-3.5 text-indigo-700" />
                <span>AI Labs</span>
              </Link>
              <Link
                href="/portfolio"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100"
              >
                <Award className="h-3.5 w-3.5 text-indigo-700" />
                <span>Portfolio</span>
              </Link>
              <Link
                href="/onboarding/placement"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100"
              >
                <Compass className="h-3.5 w-3.5 text-indigo-700" />
                <span>Placement</span>
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-stone-600" />
                <h2 className="font-serif text-base font-semibold text-stone-900">Account &amp; Privacy</h2>
              </div>
              <Link href="/privacy" className="text-xs font-semibold text-indigo-700 hover:underline">
                Manage data →
              </Link>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Export or erase learning records and recordings, or review retention controls.
            </p>

            {obs && obs.total_requests > 0 && (
              <details className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-600">
                <summary className="cursor-pointer font-semibold text-stone-700 hover:text-stone-900">
                  AI telemetry (last 7d · {obs.total_requests} requests)
                </summary>
                <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg bg-stone-50 p-2">
                    <p className="text-[10px] font-bold uppercase text-stone-500">Cache hit</p>
                    <p className="mt-0.5 font-mono font-bold text-emerald-700">{obs.cache_hit_rate}%</p>
                  </div>
                  <div className="rounded-lg bg-stone-50 p-2">
                    <p className="text-[10px] font-bold uppercase text-stone-500">Avg latency</p>
                    <p className="mt-0.5 font-mono font-bold text-stone-900">{obs.avg_latency_ms}ms</p>
                  </div>
                  <div className="rounded-lg bg-stone-50 p-2">
                    <p className="text-[10px] font-bold uppercase text-stone-500">Failures</p>
                    <p className="mt-0.5 font-mono font-bold text-stone-900">{obs.failure_count}</p>
                  </div>
                  <div className="rounded-lg bg-stone-50 p-2">
                    <p className="text-[10px] font-bold uppercase text-stone-500">Est. cost</p>
                    <p className="mt-0.5 font-mono font-bold text-indigo-700">${obs.total_cost_usd.toFixed(4)}</p>
                  </div>
                </div>
              </details>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

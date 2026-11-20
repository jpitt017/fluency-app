import Link from 'next/link';
import {
  ArrowRight,
  Award,
  BookOpen,
  Compass,
  Headphones,
  Layers,
  Mic,
  PenLine,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { WeeklyPaceSelector, WeeklyReportCard } from '@/components/b1b2/DashboardControls';
import DeleteDataButton from '@/components/b1b2/DeleteDataButton';
import { formatBandLabel, loadDashboard, loadObservabilitySummary, loadOutline } from '@/lib/b1b2/data';
import type { SkillArea } from '@/lib/b1b2/types';

export const dynamic = 'force-dynamic';

const SKILLS: { key: SkillArea; label: string; targetHours: number; icon: typeof BookOpen }[] = [
  { key: 'grammar', label: 'Grammar', targetHours: 10, icon: Sparkles },
  { key: 'vocabulary', label: 'Vocabulary', targetHours: 8, icon: Layers },
  { key: 'listening', label: 'Listening', targetHours: 12, icon: Headphones },
  { key: 'reading', label: 'Reading', targetHours: 10, icon: BookOpen },
  { key: 'speaking', label: 'Speaking', targetHours: 12, icon: Mic },
  { key: 'writing', label: 'Writing', targetHours: 10, icon: PenLine },
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
  const streakDays = dashboard?.streak_days ?? 0;
  const dueCards = dashboard?.due_cards ?? 0;
  const bandLabel = formatBandLabel(dashboard?.learner_band);
  const nextLesson = dashboard?.next_lesson;
  const checkpoints = outline?.checkpoints ?? [];
  const badges = dashboard?.badges ?? [];

  const recommendedLessonNum =
    lessonsCompleted === 0 && telemetry.placementRecommendation?.recommended_lesson
      ? telemetry.placementRecommendation.recommended_lesson
      : nextLesson?.lesson_number ?? 1;

  const progressPct = Math.min(100, Math.round((lessonsCompleted / 64) * 100));
  const ringCircumference = 2 * Math.PI * 26;
  const ringOffset = ringCircumference - (progressPct / 100) * ringCircumference;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      {/* Header + Radial Course Progress + Resume Banner */}
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
                  Goal: {weeklyGoalHours}h / week
                </span>
                <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-stone-700">
                  {streakDays}d active consistency
                </span>
                {subscriptionStatus === 'active' || subscriptionStatus === 'trialing' ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-emerald-800">Pro Member</span>
                ) : (
                  <Link href="/pricing" className="rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-800 hover:underline">
                    Core free · Optional Pro →
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
              href="/review"
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-800 shadow-2xs transition hover:bg-stone-50"
            >
              <RotateCcw className="h-4 w-4 text-amber-700" />
              <span>
                Mistake Review
                {telemetry.dueErrorCards + telemetry.missedPracticeCount > 0
                  ? ` (${telemetry.dueErrorCards + telemetry.missedPracticeCount})`
                  : ''}
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* 4 Skill-Focused Progress KPIs */}
      <section aria-label="Skill telemetry" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs">
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
        </div>

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
            <span className="font-sans text-base font-medium text-stone-400">
              / {telemetry.activeVocabTotal || 84}
            </span>
          </p>
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
                : 'No attempts yet'}
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
                : 'No drafts yet'}
            </span>
            <span className="font-semibold text-indigo-700 group-hover:underline">Archive →</span>
          </p>
        </Link>
      </section>

      <WeeklyPaceSelector currentHours={weeklyGoalHours} />

      {/* Main 2-Column Editorial Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Personalised Focus + Skill Meters + Recent Activity */}
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
                    Not enough data yet ({telemetry.totalWordsEvaluated}/{telemetry.minWordsRequired} words)
                  </span>
                )}
                <Link href="/review" className="text-xs font-semibold text-indigo-700 hover:underline">
                  Drill missed items →
                </Link>
              </div>
            </div>

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
                          : `${err.count}× logged (collecting 200w baseline)`}
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
                  : 'Complete lessons and AI speaking/writing tasks to track your errors per 100 words once 200+ words are evaluated.'}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-serif text-xl font-semibold text-stone-900">Six Skill Meters</h2>
                <p className="mt-0.5 text-xs text-stone-500">
                  Balanced coverage across Listening, Speaking, Reading, Writing, Grammar &amp; Vocabulary.
                </p>
              </div>
              <Link href="/curriculum" className="text-xs font-semibold text-indigo-700 hover:underline">
                View syllabus →
              </Link>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {SKILLS.map(({ key, label, targetHours, icon: Icon }) => {
                const stat = dashboard?.skills?.[key];
                const score = Math.round(Number(stat?.score ?? 0));
                return (
                  <div key={key} className="rounded-xl border border-stone-100 bg-stone-50/80 p-3.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-stone-800">
                        <Icon className="h-3.5 w-3.5 text-indigo-600" />
                        <span>{label}</span>
                      </span>
                      <span className="font-mono font-semibold text-indigo-700">
                        {score}% · {targetHours}h
                      </span>
                    </div>
                    <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white ring-1 ring-stone-200/70">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-indigo-700"
                        style={{ width: `${Math.min(100, Math.max(3, score))}%` }}
                      />
                    </div>
                  </div>
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

        {/* Right: Weekly Report + Checkpoints + Badges + Quick Actions */}
        <div className="space-y-6 lg:col-span-5">
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
              <h2 className="font-serif text-xl font-semibold text-stone-900">Milestones &amp; Tools</h2>
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

            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-stone-100 pt-4">
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

          {obs && obs.total_requests > 0 && (
            <section className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-lg font-semibold text-stone-900">AI Usage Telemetry (7d)</h2>
                <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-semibold text-stone-600">
                  {obs.total_requests} calls
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-4">
                <div className="rounded-xl bg-stone-50 p-2.5">
                  <p className="text-[10px] font-bold uppercase text-stone-500">Cache hit</p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-emerald-700">{obs.cache_hit_rate}%</p>
                </div>
                <div className="rounded-xl bg-stone-50 p-2.5">
                  <p className="text-[10px] font-bold uppercase text-stone-500">Avg latency</p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-stone-900">{obs.avg_latency_ms}ms</p>
                </div>
                <div className="rounded-xl bg-stone-50 p-2.5">
                  <p className="text-[10px] font-bold uppercase text-stone-500">Failures</p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-stone-900">{obs.failure_count}</p>
                </div>
                <div className="rounded-xl bg-stone-50 p-2.5">
                  <p className="text-[10px] font-bold uppercase text-stone-500">Est. cost</p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-indigo-700">${obs.total_cost_usd.toFixed(4)}</p>
                </div>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold text-stone-900">Data &amp; Privacy Controls</h2>
              <Link href="/privacy" className="text-xs font-semibold text-indigo-700 hover:underline">
                Privacy policy →
              </Link>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Delete all stored lessons, SRS cards, AI logs, and voice recordings at any time.
            </p>
            <div className="mt-3">
              <DeleteDataButton />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

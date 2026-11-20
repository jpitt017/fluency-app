import Link from 'next/link';
import { WeeklyPaceSelector, WeeklyReportCard } from '@/components/b1b2/DashboardControls';
import { formatBandLabel, loadDashboard, loadOutline } from '@/lib/b1b2/data';
import type { SkillArea } from '@/lib/b1b2/types';

export const dynamic = 'force-dynamic';

const SKILLS: { key: SkillArea; label: string; targetHours: number }[] = [
  { key: 'grammar', label: 'Grammar', targetHours: 10 },
  { key: 'vocabulary', label: 'Vocabulary', targetHours: 8 },
  { key: 'listening', label: 'Listening', targetHours: 12 },
  { key: 'reading', label: 'Reading', targetHours: 10 },
  { key: 'speaking', label: 'Speaking', targetHours: 12 },
  { key: 'writing', label: 'Writing', targetHours: 10 },
];

export default async function DashboardPage() {
  const [{ signedIn, dashboard, recentXp, weeklyGoalHours, weeklyReport, subscriptionStatus, telemetry }, outline] =
    await Promise.all([loadDashboard(), loadOutline()]);

  if (!signedIn) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Study Workspace</span>
          <h1 className="mt-2 text-2xl font-bold text-stone-900">Sign in to open your B1 → B2 dashboard</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Track all 64 lessons, review your spaced-repetition vocabulary deck, monitor six skill meters, and save AI speaking and writing feedback.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/login?next=/dashboard"
              className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800"
            >
              Sign in →
            </Link>
            <Link
              href="/curriculum"
              className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100"
            >
              Preview curriculum
            </Link>
            <Link
              href="/onboarding/placement"
              className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100"
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

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      {/* Header + Next Lesson Resume Banner */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
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
            <h1 className="text-2xl font-bold tracking-tight text-stone-900">
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

          <div className="flex shrink-0 flex-wrap gap-2.5">
            <Link
              href={`/curriculum/lessons/${recommendedLessonNum}`}
              className="rounded-xl bg-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-800"
            >
              {lessonsCompleted === 0 && telemetry.placementRecommendation?.recommended_lesson
                ? `Start Lesson ${recommendedLessonNum} →`
                : nextLesson
                  ? `Resume Lesson ${nextLesson.lesson_number} →`
                  : 'Open Curriculum →'}
            </Link>
            <Link
              href="/review"
              className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-100"
            >
              Mistake Review{telemetry.missedPracticeCount > 0 ? ` (${telemetry.missedPracticeCount})` : ''}
            </Link>
          </div>
        </div>
      </section>

      {/* 4 Skill-Focused Progress KPIs */}
      <section aria-label="Skill telemetry" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Guided Curriculum</p>
          <p className="mt-2 text-3xl font-bold text-stone-900">
            {lessonsCompleted} <span className="text-base font-medium text-stone-400">/ 64</span>
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-indigo-700"
              style={{ width: `${Math.min(100, Math.round((lessonsCompleted / 64) * 100))}%` }}
            />
          </div>
        </div>

        <Link
          href="/vocabulary"
          className="block rounded-2xl border border-stone-200 bg-white p-5 transition hover:border-indigo-300"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Retained Vocabulary</p>
            <span className="text-xs font-semibold text-indigo-700">SRS →</span>
          </div>
          <p className="mt-2 text-3xl font-bold text-stone-900">
            {telemetry.activeVocabMastered}{' '}
            <span className="text-base font-medium text-stone-400">
              / {telemetry.activeVocabTotal || 84}
            </span>
          </p>
          <p className="mt-2 text-xs text-stone-500">
            Phrases at 7+ day recall · {dueCards} due today
          </p>
        </Link>

        <Link
          href="/portfolio"
          className="block rounded-2xl border border-stone-200 bg-white p-5 transition hover:border-indigo-300"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Speaking Growth</p>
            <span className="text-xs font-semibold text-indigo-700">Archive →</span>
          </div>
          <p className="mt-2 text-3xl font-bold text-stone-900">
            {telemetry.speakingLatest !== null ? `${telemetry.speakingLatest}%` : '—'}
          </p>
          <p className="mt-2 text-xs text-stone-500">
            {telemetry.speakingCount > 0
              ? `${telemetry.speakingCount} evaluated${
                  telemetry.speakingDelta !== null
                    ? ` · ${telemetry.speakingDelta >= 0 ? `+${telemetry.speakingDelta}` : telemetry.speakingDelta}% vs prior`
                    : ''
                }`
              : 'Record a 60s speaking task to baseline'}
          </p>
        </Link>

        <Link
          href="/portfolio"
          className="block rounded-2xl border border-stone-200 bg-white p-5 transition hover:border-indigo-300"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Writing Growth</p>
            <span className="text-xs font-semibold text-indigo-700">Archive →</span>
          </div>
          <p className="mt-2 text-3xl font-bold text-stone-900">
            {telemetry.writingLatest !== null ? `${telemetry.writingLatest}%` : '—'}
          </p>
          <p className="mt-2 text-xs text-stone-500">
            {telemetry.writingCount > 0
              ? `${telemetry.writingCount} evaluated${
                  telemetry.writingDelta !== null
                    ? ` · ${telemetry.writingDelta >= 0 ? `+${telemetry.writingDelta}` : telemetry.writingDelta}% vs prior`
                    : ''
                }`
              : 'Submit a lesson draft for B2 rubric score'}
          </p>
        </Link>
      </section>

      <WeeklyPaceSelector currentHours={weeklyGoalHours} />

      {/* Main 2-Column Editorial Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Personalised Focus + Skill Meters + Recent Activity */}
        <div className="space-y-6 lg:col-span-7">
          <section className="rounded-2xl border border-stone-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-stone-900">Adaptive Focus &amp; Mistake Tracking</h2>
                <p className="mt-0.5 text-xs text-stone-500">
                  Patterns detected across your practice quizzes, speaking transcripts, and writing drafts.
                </p>
              </div>
              <Link href="/review" className="text-xs font-semibold text-indigo-700 hover:underline">
                Drill missed items →
              </Link>
            </div>

            {telemetry.recurringErrors.length > 0 ? (
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {telemetry.recurringErrors.map((err) => (
                  <Link
                    key={err.tag}
                    href="/review"
                    className="flex items-center justify-between rounded-xl border border-amber-200/80 bg-amber-50/40 px-3.5 py-2.5 text-xs transition hover:border-amber-300"
                  >
                    <span className="font-semibold text-stone-800">{err.label}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 font-bold text-amber-800 ring-1 ring-amber-200">
                      {err.count}×
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-stone-50 p-3.5 text-xs leading-5 text-stone-600">
                {telemetry.missedPracticeCount > 0
                  ? `You have ${telemetry.missedPracticeCount} missed practice items ready for active recall review.`
                  : 'Complete lessons and AI speaking/writing tasks to surface your personal grammar and pronunciation focus areas.'}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-stone-900">Six Skill Meters</h2>
                <p className="mt-0.5 text-xs text-stone-500">
                  Balanced coverage across Listening, Speaking, Reading, Writing, Grammar &amp; Vocabulary.
                </p>
              </div>
              <Link href="/curriculum" className="text-xs font-semibold text-indigo-700 hover:underline">
                View syllabus →
              </Link>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {SKILLS.map(({ key, label, targetHours }) => {
                const stat = dashboard?.skills?.[key];
                const score = Math.round(Number(stat?.score ?? 0));
                return (
                  <div key={key} className="rounded-xl border border-stone-100 bg-stone-50 p-3.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-stone-800">{label}</span>
                      <span className="font-semibold text-indigo-700">
                        {score}% · {targetHours}h
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white ring-1 ring-stone-200/70">
                      <div
                        className="h-full rounded-full bg-indigo-700"
                        style={{ width: `${Math.min(100, Math.max(2, score))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-6">
            <h2 className="text-lg font-bold text-stone-900">Recent Study Log</h2>
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

          <section className="rounded-2xl border border-stone-200 bg-white p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-stone-900">Assessment Checkpoints</h2>
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
                  className="flex items-start justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3.5 transition hover:border-indigo-300"
                >
                  <div>
                    <p className="text-xs font-semibold text-indigo-700">{cp.timing}</p>
                    <p className="text-sm font-bold text-stone-900">{cp.title}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
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

          <section className="rounded-2xl border border-stone-200 bg-white p-6">
            <h2 className="text-lg font-bold text-stone-900">Milestones &amp; Tools</h2>
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
                className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-center text-xs font-semibold text-stone-800 hover:bg-stone-100"
              >
                AI Labs
              </Link>
              <Link
                href="/portfolio"
                className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-center text-xs font-semibold text-stone-800 hover:bg-stone-100"
              >
                Portfolio
              </Link>
              <Link
                href="/onboarding/placement"
                className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-center text-xs font-semibold text-stone-800 hover:bg-stone-100"
              >
                Placement
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

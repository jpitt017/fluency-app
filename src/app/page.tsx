import Link from 'next/link';
import { getViewer, loadOutline } from '@/lib/b1b2/data';

export const dynamic = 'force-dynamic';

const DAILY_FLOW_FALLBACK = [
  { block: 'warm_up', minutes: 3, label: 'Warm-up', description: 'Recall 5–10 spaced-repetition vocabulary cards.' },
  { block: 'input', minutes: 8, label: 'Input', description: 'Short grammar explanation, reading article or listening audio.' },
  { block: 'practice', minutes: 10, label: 'Practice', description: 'Interactive exercises on target grammar and vocabulary.' },
  { block: 'output', minutes: 10, label: 'Output', description: 'Guided voice recording, writing draft or role-play.' },
  { block: 'feedback', minutes: 4, label: 'Feedback', description: 'Corrections, alternative phrasing and rubric review.' },
];

const SKILL_HOURS_FALLBACK = [
  { skill: 'Listening', hours: 12 },
  { skill: 'Speaking', hours: 12 },
  { skill: 'Grammar', hours: 10 },
  { skill: 'Reading', hours: 10 },
  { skill: 'Writing', hours: 10 },
  { skill: 'Vocabulary', hours: 8 },
  { skill: 'Review & Checkpoints', hours: 2 },
];

export default async function Home() {
  const [outline, viewer] = await Promise.all([loadOutline(), getViewer()]);
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

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      {/* Editorial Hero Split */}
      <section className="grid gap-8 lg:grid-cols-12 lg:items-start">
        <div className="space-y-6 lg:col-span-7">
          <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-700">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
            <span>CEFR B1 → B2 · Independent User</span>
            <span aria-hidden className="text-stone-300">·</span>
            <span>{course?.total_hours ?? 64} guided hours</span>
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-stone-900 sm:text-5xl">
            A calm, structured workspace to reach solid B2 English.
          </h1>

          <p className="max-w-2xl text-base leading-7 text-stone-600">
            {course?.description ??
              'Eight themed modules of eight lessons each (64 lessons total) built around the five-block daily loop: spaced-repetition warm-up, focused input, interactive practice, spoken or written output, and actionable AI feedback.'}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href={viewer.signedIn ? '/dashboard' : '/curriculum'}
              className="rounded-xl bg-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-800"
            >
              {viewer.signedIn ? 'Open Study Dashboard →' : 'Browse 64-Lesson Curriculum →'}
            </Link>
            <Link
              href="/labs"
              className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-100"
            >
              Speaking & Writing Labs
            </Link>
            {!viewer.signedIn && (
              <Link
                href="/onboarding/placement"
                className="px-3 py-3 text-sm font-semibold text-indigo-700 hover:underline"
              >
                Take 3-min placement check
              </Link>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-4 border-t border-stone-200 pt-6 sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium text-stone-500">Course length</dt>
              <dd className="mt-1 text-xl font-bold text-stone-900">{course?.total_hours ?? 64} hours</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-stone-500">Structure</dt>
              <dd className="mt-1 text-xl font-bold text-stone-900">8 × 8 lessons</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-stone-500">Daily pace</dt>
              <dd className="mt-1 text-xl font-bold text-stone-900">
                {course?.daily_minutes_min ?? 20}–{course?.daily_minutes_max ?? 45} min
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-stone-500">Checkpoints</dt>
              <dd className="mt-1 text-xl font-bold text-stone-900">Modules 2, 4, 6, 8</dd>
            </div>
          </dl>
        </div>

        {/* Right Architectural Panel */}
        <aside className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs lg:col-span-5">
          <div className="flex items-center justify-between border-b border-stone-100 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Daily Study Loop</p>
              <h2 className="mt-0.5 text-base font-bold text-stone-900">5-Block Lesson Architecture</h2>
            </div>
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
              ~35–45 min
            </span>
          </div>

          <ol className="mt-4 space-y-2.5">
            {dailyFlow.map((step, idx) => (
              <li key={step.block} className="flex items-start gap-3 rounded-xl bg-stone-50 p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-xs font-bold text-indigo-700 ring-1 ring-stone-200">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-stone-900">{step.label}</span>
                    <span className="text-xs font-medium text-stone-500">{step.minutes} min</span>
                  </div>
                  <p className="mt-0.5 text-xs leading-5 text-stone-600">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-5 border-t border-stone-100 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">64-Hour Skill Balance</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {skillBalance.map((item) => (
                <span
                  key={item.skill}
                  className="rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-700"
                >
                  {item.skill} · <strong className="text-stone-900">{item.hours}h</strong>
                </span>
              ))}
            </div>
          </div>
        </aside>
      </section>

      {/* 8-Module Roadmap */}
      {modules.length > 0 && (
        <section className="mt-14 border-t border-stone-200 pt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Syllabus</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">Eight Modules from B1 to B2</h2>
            </div>
            <Link href="/curriculum" className="text-sm font-semibold text-indigo-700 hover:underline">
              Explore all 64 lessons →
            </Link>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map((mod) => (
              <Link
                key={mod.id}
                href={`/curriculum/lessons/${mod.lesson_start}`}
                className="group flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 transition hover:border-indigo-300 hover:shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-indigo-700">Module {String(mod.number).padStart(2, '0')}</span>
                    <span className="text-stone-500">
                      L{mod.lesson_start}–{mod.lesson_end} · {mod.hours}h
                    </span>
                  </div>
                  <h3 className="mt-2 text-base font-bold text-stone-900 group-hover:text-indigo-700">{mod.title}</h3>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-stone-600">{mod.summary}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-stone-100 pt-3">
                  {mod.grammar.slice(0, 2).map((g) => (
                    <span key={g} className="rounded bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
                      {g}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Checkpoints */}
      {checkpoints.length > 0 && (
        <section className="mt-12 rounded-2xl border border-stone-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Progress Gates</p>
              <h2 className="mt-0.5 text-lg font-bold text-stone-900">Four Assessment Checkpoints</h2>
            </div>
            <span className="text-xs text-stone-500">Timed reading, listening, speaking & writing rubrics</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {checkpoints.map((cp) => (
              <Link
                key={cp.code}
                href={`/checkpoints/${cp.code}`}
                className="rounded-xl border border-stone-200 bg-stone-50 p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <span className="text-xs font-semibold text-indigo-700">{cp.timing}</span>
                <p className="mt-1 text-sm font-bold text-stone-900">{cp.title}</p>
                <p className="mt-1 text-xs leading-5 text-stone-600">{cp.description}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

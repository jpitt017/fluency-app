'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { CurriculumOutline, OutlineModule, SkillArea } from '@/lib/b1b2/types';

const SKILLS: SkillArea[] = ['grammar', 'vocabulary', 'listening', 'reading', 'speaking', 'writing'];
const SKILL_LABEL: Record<SkillArea, string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  listening: 'Listening',
  reading: 'Reading',
  speaking: 'Speaking',
  writing: 'Writing',
  review: 'Review',
};
const SKILL_ABBR: Record<SkillArea, string> = {
  grammar: 'GR',
  vocabulary: 'VOC',
  listening: 'L',
  reading: 'R',
  speaking: 'SP',
  writing: 'WR',
  review: 'REV',
};

function statusChip(status: string) {
  if (status === 'completed') return 'bg-emerald-100 text-emerald-800';
  if (status === 'in_progress') return 'bg-indigo-100 text-indigo-800';
  return 'bg-stone-100 text-stone-600';
}

function statusLabel(status: string) {
  if (status === 'completed') return 'Complete';
  if (status === 'in_progress') return 'In progress';
  return 'Not started';
}

export default function CurriculumOverview({ outline, signedIn }: { outline: CurriculumOutline; signedIn: boolean }) {
  const { course, modules, checkpoints, due_cards: dueCards } = outline;
  const [filter, setFilter] = useState<'all' | SkillArea>('all');
  const [expanded, setExpanded] = useState<number[]>(modules.length ? [modules[0].number] : []);

  const allLessons = useMemo(() => modules.flatMap((module) => module.lessons), [modules]);
  const totalLessons = allLessons.length || 64;
  const completedLessons = allLessons.filter((lesson) => lesson.status === 'completed');
  const completedCount = completedLessons.length;
  const completedHours = completedLessons.length;

  const nextLesson = allLessons.find((lesson) => lesson.status !== 'completed') ?? null;

  const skillProgress = useMemo(() => {
    return SKILLS.map((skill) => {
      const lessons = allLessons.filter((lesson) => lesson.skill === skill);
      const done = lessons.filter((lesson) => lesson.status === 'completed').length;
      const fromRpc = outline.skills?.[skill];
      const percent =
        typeof fromRpc === 'number' && fromRpc > 0
          ? Math.round(fromRpc)
          : lessons.length
            ? Math.round((done / lessons.length) * 100)
            : 0;
      return { skill, percent, done, total: lessons.length };
    });
  }, [allLessons, outline.skills]);

  const visibleModules =
    filter === 'all' ? modules : modules.filter((module) => module.lessons.some((lesson) => lesson.skill === filter));
  const allExpanded = modules.length > 0 && expanded.length === modules.length;

  function toggleModule(number: number) {
    setExpanded((current) => (current.includes(number) ? current.filter((item) => item !== number) : [...current, number]));
  }

  function toggleAll() {
    setExpanded(allExpanded ? [] : modules.map((module) => module.number));
  }

  function moduleStats(module: OutlineModule) {
    const done = module.lessons.filter((lesson) => lesson.status === 'completed').length;
    const active = module.lessons.some((lesson) => lesson.status === 'in_progress');
    return { done, active };
  }

  return (
    <>
      <header className="mb-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-full bg-indigo-700 px-2.5 py-1 text-white">
                {course?.level_from ?? 'B1'} → {course?.level_to ?? 'B2'}
              </span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-700">
                {course?.total_hours ?? 64} guided hours
              </span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-700">
                {modules.length} modules · {totalLessons} lessons
              </span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-700">
                {course?.daily_minutes_min ?? 20}–{course?.daily_minutes_max ?? 45} min/day
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-stone-900">
              {course?.title ?? 'English B1 → B2: Independent User'}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              {course?.subtitle ?? 'Eight themed modules of eight lessons, built around five daily blocks.'}
            </p>
          </div>

          <Link
            href={nextLesson ? `/curriculum/lessons/${nextLesson.number}` : '/curriculum/lessons/1'}
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-800"
          >
            {nextLesson
              ? completedCount
                ? `Continue · Lesson ${nextLesson.number}: ${nextLesson.title}`
                : 'Start Lesson 1 · Module 1 →'
              : 'Review final assessment'}
          </Link>
        </div>
      </header>

      <section
        aria-label="Course progress"
        className="mb-6 rounded-2xl border border-indigo-200/70 bg-indigo-50/70 p-4 sm:flex sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-sm font-bold text-stone-900">{signedIn ? 'Your progress' : 'Course progress'}</p>
          <p className="mt-1 text-sm text-stone-600">
            {completedCount} / {totalLessons} lessons · {completedHours} / {course?.total_hours ?? 64} hours completed
            {signedIn && dueCards > 0 ? ` · ${dueCards} vocabulary cards due` : ''}
          </p>
          {!signedIn && (
            <p className="mt-1 text-xs text-stone-500">
              Sign in to track lessons, save recordings, and keep your spaced-repetition queue.
            </p>
          )}
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white sm:mt-0 sm:ml-6 sm:max-w-xs">
          <div
            className="h-full rounded-full bg-indigo-700"
            style={{ width: `${Math.min(100, (completedCount / totalLessons) * 100)}%` }}
          />
        </div>
      </section>

      <div className="mb-6 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-lg font-bold text-stone-900">Skill balance</h2>
          <p className="mt-1 text-xs text-stone-500">Lesson completion per skill across all eight modules.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {skillProgress.map(({ skill, percent, done, total }) => (
              <div key={skill}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-semibold text-stone-700">
                    <span className="mr-1.5 inline-flex h-5 min-w-8 items-center justify-center rounded bg-indigo-50 px-1 text-[10px] font-bold text-indigo-700">
                      {SKILL_ABBR[skill]}
                    </span>
                    {SKILL_LABEL[skill]}
                  </span>
                  <span className="text-stone-500">
                    {done}/{total}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full rounded-full bg-indigo-700" style={{ width: `${Math.min(100, percent)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-lg font-bold text-stone-900">Daily flow</h2>
          <p className="mt-1 text-xs text-stone-500">
            Every lesson follows the same five blocks, about {course?.daily_minutes_max ?? 45} minutes end to end.
          </p>
          <ol className="mt-4 space-y-2">
            {(course?.daily_flow ?? []).map((step, index) => (
              <li key={step.block} className="flex items-start gap-3 rounded-lg bg-stone-50 p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-indigo-700 ring-1 ring-stone-200">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-800">
                    {step.label} <span className="font-normal text-stone-500">· {step.minutes} min</span>
                  </p>
                  <p className="text-xs leading-5 text-stone-600">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section aria-label="Checkpoints" className="mb-8 rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-600">Assessment checkpoints</h2>
          <Link href="/checkpoints" className="text-xs font-semibold text-indigo-700 hover:underline">
            View all checkpoints →
          </Link>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {checkpoints.map((checkpoint) => {
            return (
              <Link
                key={checkpoint.code}
                href={`/checkpoints/${checkpoint.code}`}
                className="rounded-xl border border-stone-200 bg-stone-50 p-3 transition hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-indigo-700">{checkpoint.timing}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      checkpoint.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {checkpoint.status === 'completed' ? 'Passed' : 'Take exam'}
                  </span>
                </div>
                <p className="mt-1.5 text-xs font-bold text-stone-900">{checkpoint.title}</p>
                <p className="mt-1 text-[11px] leading-4 text-stone-600">{checkpoint.description}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section id="module-directory">
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold text-stone-900">Module directory</h2>
              <p className="mt-0.5 text-xs text-stone-500">
                {modules.length} modules · 8 lessons each · 5-block lesson structure
              </p>
            </div>
            <button
              type="button"
              onClick={toggleAll}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
              {allExpanded ? 'Collapse all details' : 'Expand all details'}
            </button>
          </div>

          <nav aria-label="Jump to module" className="flex flex-wrap gap-2">
            {modules.map((module) => (
              <a
                key={module.id}
                href={`#module-${module.number}`}
                className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:border-indigo-300 hover:text-indigo-700"
              >
                M{module.number}
              </a>
            ))}
          </nav>

          <div role="group" aria-label="Filter modules by skill" className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilter('all')}
              aria-pressed={filter === 'all'}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                filter === 'all' ? 'bg-stone-900 text-white' : 'bg-stone-200/70 text-stone-700 hover:bg-stone-200'
              }`}
            >
              All modules
            </button>
            {SKILLS.map((skill) => (
              <button
                key={skill}
                type="button"
                onClick={() => setFilter(skill)}
                aria-pressed={filter === skill}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  filter === skill ? 'bg-stone-900 text-white' : 'bg-stone-200/70 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {SKILL_LABEL[skill]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {visibleModules.map((module) => {
            const isExpanded = expanded.includes(module.number);
            const { done, active } = moduleStats(module);
            return (
              <article
                id={`module-${module.number}`}
                key={module.id}
                className="scroll-mt-24 rounded-2xl border border-stone-200 bg-white p-4 shadow-xs sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm font-bold text-indigo-700">
                      {String(module.number).padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-bold text-stone-900">{module.title}</h3>
                      <p className="mt-0.5 text-xs text-stone-500">
                        Lessons {module.lesson_start}–{module.lesson_end} · {module.hours} hours · {done}/8 complete
                      </p>
                      <p className="mt-1 text-xs text-stone-600">{module.summary}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`hidden rounded-full px-2.5 py-1 text-xs font-semibold sm:inline-flex ${statusChip(
                        done === 8 ? 'completed' : active ? 'in_progress' : 'not_started',
                      )}`}
                    >
                      {done === 8 ? 'Complete' : active ? 'In progress' : 'Not started'}
                    </span>
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={`module-details-${module.number}`}
                      onClick={() => toggleModule(module.number)}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                    >
                      {isExpanded ? 'Hide lessons' : 'Show lessons'}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div
                    id={`module-details-${module.number}`}
                    className="mt-4 grid grid-cols-1 gap-2.5 border-t border-stone-100 pt-4 sm:grid-cols-2 lg:grid-cols-4"
                  >
                    {module.lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className={`rounded-xl border p-3 transition ${
                          lesson.status === 'completed'
                            ? 'border-emerald-300 bg-emerald-50/40'
                            : 'border-stone-200 hover:border-indigo-300 hover:bg-indigo-50/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-indigo-700">Lesson {lesson.number}</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusChip(lesson.status)}`}>
                            {statusLabel(lesson.status)}
                          </span>
                        </div>
                        <Link
                          href={`/curriculum/lessons/${lesson.number}`}
                          className="mt-1 block text-xs font-semibold text-stone-900 hover:text-indigo-700"
                        >
                          {lesson.title}
                        </Link>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-stone-500">{lesson.can_do}</p>
                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                          <span className="rounded bg-white px-1.5 py-0.5 font-semibold text-stone-600 ring-1 ring-stone-200/70">
                            {SKILL_ABBR[lesson.skill]} · {SKILL_LABEL[lesson.skill]}
                          </span>
                          <Link href={`/curriculum/lessons/${lesson.number}`} className="font-semibold text-indigo-700 hover:underline">
                            Study →
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-stone-500">Grammar</span>
                  {module.grammar.map((item) => (
                    <span key={item} className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-700">
                      {item}
                    </span>
                  ))}
                  <span className="ml-1 font-semibold text-stone-500">Topic</span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">{module.topic}</span>
                </div>
              </article>
            );
          })}
          {!visibleModules.length && (
            <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
              No modules match this skill filter.
            </p>
          )}
        </div>
      </section>
    </>
  );
}

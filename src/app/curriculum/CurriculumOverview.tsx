'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, Stethoscope } from 'lucide-react';
import type { CurriculumOutline, OutlineModule, SkillArea } from '@/lib/b1b2/types';

const SKILLS: SkillArea[] = ['vocabulary', 'grammar', 'listening', 'reading', 'speaking', 'writing', 'review'];
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

function requirementTag(req?: string) {
  if (req === 'required') return { label: 'Required', cls: 'bg-rose-50 text-rose-700 ring-rose-200/70' };
  if (req === 'either_wed_thu') return { label: 'Wed/Thu min', cls: 'bg-sky-50 text-sky-700 ring-sky-200/70' };
  return { label: 'Optional', cls: 'bg-stone-50 text-stone-500 ring-stone-200/70' };
}

export default function CurriculumOverview({ outline, signedIn }: { outline: CurriculumOutline; signedIn: boolean }) {
  const {
    course,
    modules,
    checkpoints,
    due_cards: dueCards,
    listening_weeks_completed: listeningWeeks = 0,
    reading_weeks_completed: readingWeeks = 0,
  } = outline;
  const [filter, setFilter] = useState<'all' | SkillArea>('all');
  const [expanded, setExpanded] = useState<number[]>(modules.length ? [modules[0].number] : []);

  const allLessons = useMemo(() => modules.flatMap((module) => module.lessons), [modules]);
  const totalLessons = allLessons.length || 112;
  const completedLessons = allLessons.filter((lesson) => lesson.status === 'completed');
  const completedCount = completedLessons.length;

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
                ~{course?.total_hours ?? 63}h full ({course?.min_hours ?? 55}h min)
              </span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-700">
                {modules.length} weeks · {totalLessons} daily sessions
              </span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-700">
                {course?.daily_minutes_min ?? 15}–{course?.daily_minutes_max ?? 30} min/day · 2 weekly live lessons (60 + 55m)
              </span>
            </div>
            <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
              {course?.title ?? 'English B1 → B2: 16-Week Preparation'}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              {course?.subtitle ??
                '16-week blended B2 preparation course with 7 daily sessions per week, required Friday speaking and Saturday writing, two weekly live lessons, and four checkpoints.'}
            </p>
            {course?.positioning && (
              <p className="mt-1.5 text-xs font-medium text-stone-500">{course.positioning}</p>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            <Link
              href={nextLesson ? `/curriculum/lessons/${nextLesson.number}` : '/curriculum/lessons/1'}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-950/15 transition hover:-translate-y-0.5 hover:bg-indigo-800"
            >
              <BookOpen className="h-4 w-4" />
              <span>
                {nextLesson
                  ? completedCount
                    ? `Continue · Session ${nextLesson.number}: ${nextLesson.title}`
                    : 'Start Week 1 · Session 1'
                  : 'Review Checkpoint 4'}
              </span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/clinic"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:underline"
            >
              <Stethoscope className="h-3.5 w-3.5" />
              <span>Need B1 basics? Open Grammar Clinic →</span>
            </Link>
          </div>
        </div>
      </header>

      <section
        aria-label="Course progress"
        className="mb-6 rounded-2xl border border-indigo-200/70 bg-indigo-50/70 p-4 sm:flex sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-sm font-bold text-stone-900">{signedIn ? 'Your 16-week progress' : 'Course structure'}</p>
          <p className="mt-1 text-sm text-stone-600">
            {completedCount} / {totalLessons} sessions completed
            {signedIn
              ? ` · Listening ${listeningWeeks}/12+ wks · Reading ${readingWeeks}/12+ wks${dueCards > 0 ? ` · ${dueCards} cards due` : ''}`
              : ' · Output before progress: Fri speaking & Sat writing required weekly'}
          </p>
          {!signedIn && (
            <p className="mt-1 text-xs text-stone-500">
              Sign in to track daily sessions, save recordings, and keep your spaced-repetition queue.
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
          <h2 className="text-lg font-bold text-stone-900">Weekly 7-Day Skill Rotation</h2>
          <p className="mt-1 text-xs text-stone-500">Completion across all 16 weeks (112 daily sessions).</p>
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
          <h2 className="text-lg font-bold text-stone-900">Mon–Sun Weekly Rhythm</h2>
          <p className="mt-1 text-xs text-stone-500">
            15 min/day Mon–Fri &amp; Sun, 30 min Sat writing, plus two live lessons (60 &amp; 55 min).
          </p>
          <ol className="mt-3 space-y-1.5">
            {(course?.daily_flow ?? []).map((step, index) => (
              <li key={step.day ?? step.block ?? index} className="flex items-start gap-2.5 rounded-lg bg-stone-50 px-3 py-2">
                <span className="flex h-6 w-9 shrink-0 items-center justify-center rounded-md bg-white text-[11px] font-bold text-indigo-700 ring-1 ring-stone-200">
                  {step.day ?? index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-stone-800">
                    {step.label} <span className="font-normal text-stone-500">· {step.minutes} min</span>
                  </p>
                  <p className="text-[11px] leading-4 text-stone-600">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section aria-label="Checkpoints" className="mb-8 rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-600">
            Four Milestone Checkpoints (Weeks 4, 8, 12, 16)
          </h2>
          <Link href="/checkpoints" className="text-xs font-semibold text-indigo-700 hover:underline">
            View all checkpoints →
          </Link>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {checkpoints.map((checkpoint) => (
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
          ))}
        </div>
      </section>

      <section id="module-directory">
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold text-stone-900">16-Week Syllabus Directory</h2>
              <p className="mt-0.5 text-xs text-stone-500">
                {modules.length} weeks · 7 daily sessions each (Mon–Sun) · Main + Light grammar
              </p>
            </div>
            <button
              type="button"
              onClick={toggleAll}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
              {allExpanded ? 'Collapse all weeks' : 'Expand all weeks'}
            </button>
          </div>

          <nav aria-label="Jump to week" className="flex flex-wrap gap-1.5">
            {modules.map((module) => (
              <a
                key={module.id}
                href={`#week-${module.number}`}
                className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:border-indigo-300 hover:text-indigo-700"
              >
                W{module.number}
              </a>
            ))}
          </nav>

          <div role="group" aria-label="Filter weeks by skill" className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilter('all')}
              aria-pressed={filter === 'all'}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                filter === 'all' ? 'bg-stone-900 text-white' : 'bg-stone-200/70 text-stone-700 hover:bg-stone-200'
              }`}
            >
              All weeks
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
            const totalInWeek = module.lessons.length || 7;
            const modPct = Math.round((done / totalInWeek) * 100);
            const isCheckpointWeek = module.number % 4 === 0;
            return (
              <article
                id={`week-${module.number}`}
                key={module.id}
                className="scroll-mt-24 rounded-2xl border border-stone-200/90 bg-white p-4 shadow-2xs transition hover:border-stone-300 sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 font-serif text-base font-bold text-indigo-700 ring-1 ring-indigo-100">
                      W{module.number}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-stone-900">{module.title}</h3>
                        {module.phase && (
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                            {module.phase}
                          </span>
                        )}
                        {isCheckpointWeek && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            Checkpoint {module.number / 4}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                        <span>Sessions {module.lesson_start}–{module.lesson_end} · ~{module.hours}h blended</span>
                        <span className="inline-flex items-center gap-1 font-semibold text-indigo-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>{done}/{totalInWeek} complete</span>
                        </span>
                      </p>
                      <p className="mt-1 text-xs leading-5 text-stone-600">{module.summary}</p>
                      <div className="mt-2 h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-stone-100">
                        <div className="h-full rounded-full bg-indigo-600" style={{ width: `${modPct}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`hidden rounded-full px-2.5 py-1 text-xs font-semibold sm:inline-flex ${statusChip(
                        done === totalInWeek ? 'completed' : active ? 'in_progress' : 'not_started',
                      )}`}
                    >
                      {done === totalInWeek ? 'Complete' : active ? 'In progress' : 'Not started'}
                    </span>
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={`week-details-${module.number}`}
                      onClick={() => toggleModule(module.number)}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                    >
                      {isExpanded ? 'Hide sessions' : 'Show 7 days'}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div
                    id={`week-details-${module.number}`}
                    className="mt-4 grid grid-cols-1 gap-2.5 border-t border-stone-100 pt-4 sm:grid-cols-2 lg:grid-cols-4"
                  >
                    {module.lessons.map((lesson) => {
                      const req = requirementTag(lesson.requirement);
                      return (
                        <div
                          key={lesson.id}
                          className={`rounded-xl border p-3 transition ${
                            lesson.status === 'completed'
                              ? 'border-emerald-300 bg-emerald-50/40'
                              : 'border-stone-200 hover:border-indigo-300 hover:bg-indigo-50/30'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold text-indigo-700">
                              {lesson.day_of_week ?? `Day ${lesson.module_lesson}`} · #{lesson.number}
                            </span>
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
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[10px]">
                            <div className="flex items-center gap-1">
                              <span className="rounded bg-white px-1.5 py-0.5 font-semibold text-stone-600 ring-1 ring-stone-200/70">
                                {SKILL_ABBR[lesson.skill]}
                              </span>
                              <span className={`rounded px-1.5 py-0.5 font-semibold ring-1 ${req.cls}`}>
                                {req.label}
                              </span>
                            </div>
                            <Link href={`/curriculum/lessons/${lesson.number}`} className="text-[11px] font-semibold text-indigo-700 hover:underline">
                              Open →
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-stone-500">Main</span>
                  {module.grammar.slice(0, 1).map((item) => (
                    <span key={item} className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-700">
                      {item}
                    </span>
                  ))}
                  {module.light_grammar && (
                    <>
                      <span className="font-semibold text-stone-500">Light</span>
                      <span className="rounded-full bg-indigo-50/70 px-2.5 py-1 text-indigo-800">
                        {module.light_grammar}
                      </span>
                    </>
                  )}
                  <span className="ml-1 font-semibold text-stone-500">Topic</span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">{module.topic}</span>
                </div>
              </article>
            );
          })}
          {!visibleModules.length && (
            <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
              No weeks match this skill filter.
            </p>
          )}
        </div>
      </section>
    </>
  );
}

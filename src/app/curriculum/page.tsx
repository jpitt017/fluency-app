'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { b1Curriculum, type CefrSkill, type CurriculumModule } from '@/lib/curriculum';

type ObjectiveProgress = { objective_id: string; mastery: number };
type LessonProgress = { module_number: number; lesson_number: number; status: string; score: number | null };
type Checkpoint = { id: string; module_number: number; passed: boolean; rubric: Record<string, unknown>; transcript: string | null; created_at: string };
type Filter = 'All modules' | 'Speaking & Interaction' | 'Writing' | 'Conditionals & Modality';

const skills: CefrSkill[] = ['Listening', 'Reading', 'Spoken Interaction', 'Spoken Production', 'Writing'];
const abbreviations: Record<CefrSkill, string> = { Listening: 'L', Reading: 'R', 'Spoken Interaction': 'SI', 'Spoken Production': 'SP', Writing: 'WR' };
const filters: Filter[] = ['All modules', 'Speaking & Interaction', 'Writing', 'Conditionals & Modality'];

function moduleMatches(module: CurriculumModule, filter: Filter) {
  if (filter === 'All modules') return true;
  if (filter === 'Speaking & Interaction') return module.cefr_objectives.some((objective) => objective.skill === 'Spoken Interaction' || objective.skill === 'Spoken Production');
  if (filter === 'Writing') return module.cefr_objectives.some((objective) => objective.skill === 'Writing');
  return module.target_grammar.some((item) => /conditional|modal|passive|reported|cleft|tense|future/i.test(item));
}

function canDoText(module: CurriculumModule, skill: CefrSkill) {
  const objective = module.cefr_objectives.find((item) => item.skill === skill);
  if (!objective) return '';
  return objective.can_do.trim();
}

export default function CurriculumPage() {
  const [objectiveProgress, setObjectiveProgress] = useState<ObjectiveProgress[]>([]);
  const [lessonProgress, setLessonProgress] = useState<LessonProgress[]>([]);
  const [portfolio, setPortfolio] = useState<Checkpoint[]>([]);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<Filter>('All modules');
  const [expandedModules, setExpandedModules] = useState<number[]>([]);

  useEffect(() => {
    let mounted = true;
    async function loadLearnerState() {
      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return;
        const [mastery, lessons, attempts] = await Promise.all([
          supabase.from('cefr_objective_progress').select('objective_id,mastery').eq('user_id', user.id),
          supabase.from('lesson_progress').select('module_number,lesson_number,status,score').eq('user_id', user.id),
          supabase.from('cefr_checkpoint_attempts').select('id,module_number,passed,rubric,transcript,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(3),
        ]);
        if (!mounted) return;
        const failed = mastery.error || lessons.error || attempts.error;
        if (failed) {
          setLoadError('Progress saving is not configured yet. You can still browse and use the sessions.');
          return;
        }
        setObjectiveProgress(mastery.data ?? []);
        setLessonProgress(lessons.data ?? []);
        setPortfolio(attempts.data ?? []);
      } catch {
        if (mounted) setLoadError('Sign in to sync your learning progress across devices.');
      }
    }
    void loadLearnerState();
    return () => { mounted = false; };
  }, []);

  const completed = useMemo(
    () => new Set(lessonProgress.filter((item) => item.status === 'completed').map((item) => `${item.module_number}:${item.lesson_number}`)),
    [lessonProgress],
  );
  const completedCount = completed.size;
  const completedHours = completedCount * 2;
  const totalSessions = b1Curriculum.total_sessions;
  const nextLesson = (() => {
    for (const curriculumModule of b1Curriculum.modules) {
      for (const lesson of curriculumModule.lessons) {
        if (!completed.has(`${curriculumModule.module_number}:${lesson.lesson_number}`)) {
          return { module: curriculumModule, lesson };
        }
      }
    }
    return null;
  })();

  const masteryById = new Map(objectiveProgress.map((item) => [item.objective_id, Number(item.mastery)]));
  const visibleModules = b1Curriculum.modules.filter((module) => moduleMatches(module, filter));
  const allExpanded = visibleModules.length > 0 && visibleModules.every((module) => expandedModules.includes(module.module_number));

  function toggleModule(number: number) {
    setExpandedModules((current) => current.includes(number) ? current.filter((item) => item !== number) : [...current, number]);
  }
  function toggleAll() {
    setExpandedModules(allExpanded ? [] : visibleModules.map((module) => module.module_number));
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:py-10">
      <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">
            CEFR B1 → B2 · {b1Curriculum.total_hours} hours · {b1Curriculum.weeks} weeks
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">{b1Curriculum.title}</h1>
          <p className="mt-1 text-sm text-slate-600">
            8 modules · 4 two-hour sessions each ({totalSessions} sessions total) · 4-block 120-minute structure
          </p>
        </div>
        <Link
          href={nextLesson ? `/curriculum/modules/${nextLesson.module.module_number}/lessons/${nextLesson.lesson.lesson_number}` : '/curriculum/modules/8/lessons/4'}
          className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-indigo-700"
        >
          {nextLesson
            ? completedCount
              ? `Continue · Session ${nextLesson.lesson.session_number} (M${nextLesson.module.module_number})`
              : 'Start Session 1 · Module 1'
            : 'Review B2 Global Capstone'}
        </Link>
      </header>

      <section aria-label="Course progress" className="mb-6 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 sm:flex sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-slate-900">Continue learning</p>
          <p className="mt-1 text-sm text-slate-600">
            {completedCount} / {totalSessions} sessions · {completedHours} / {b1Curriculum.total_hours} hours completed
          </p>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white sm:mt-0 sm:ml-6 sm:max-w-xs">
          <div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.min(100, (completedCount / totalSessions) * 100)}%` }} />
        </div>
      </section>

      <div className="mb-6 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">CEFR skill mastery</h2>
              <p className="mt-1 text-xs text-slate-500">Updated by module synthesis checkpoints (Session 4 of each module).</p>
            </div>
            <span title="Checkpoint sessions contribute mastery evidence across the 5 CEFR skills." className="cursor-help rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
              ⓘ Checkpoints
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {skills.map((skill) => {
              const objectives = b1Curriculum.modules.flatMap((module) => module.cefr_objectives.filter((objective) => objective.skill === skill));
              const score = objectives.length ? Math.round(objectives.reduce((sum, objective) => sum + (masteryById.get(objective.id) ?? 0), 0) / objectives.length) : 0;
              return (
                <div key={skill}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-semibold text-slate-700">
                      <span className="mr-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-indigo-50 px-1 text-indigo-700">{abbreviations[skill]}</span>
                      {skill}
                    </span>
                    <span className="text-slate-500">{score}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-indigo-600" style={{ width: `${score}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Progress Passport</h2>
              <p className="mt-1 text-xs text-slate-500">Recent checkpoint achievements & B2 assessment milestones</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{portfolio.length} recent</span>
          </div>
          {portfolio.length ? (
            <ul className="mt-3 space-y-2">
              {portfolio.slice(0, 2).map((attempt) => (
                <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3">
                  <span className="text-sm font-semibold text-slate-800">Module {attempt.module_number}</span>
                  <span className={attempt.passed ? 'rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800' : 'rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800'}>
                    {attempt.passed ? 'Can-Do achieved' : 'Retry recommended'}
                  </span>
                  {attempt.transcript && (
                    <details className="w-full text-xs text-slate-600">
                      <summary className="cursor-pointer text-indigo-700">View submission</summary>
                      <p className="mt-2 whitespace-pre-wrap">{attempt.transcript}</p>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 rounded-lg bg-slate-50 p-3">
              <p className="text-sm text-slate-600">Your checkpoint badges and submissions will appear here.</p>
              <Link href="/curriculum/modules/1/lessons/4" className="mt-2 inline-block text-sm font-semibold text-indigo-700 hover:text-indigo-900">
                Try the Module 1 checkpoint (Session 4) →
              </Link>
            </div>
          )}
        </section>
      </div>

      <section aria-label="Assessment breakdown" className="mb-8 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">Course Assessment Breakdown</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {b1Curriculum.assessments.map((assessment) => (
            <div key={assessment.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-indigo-700">{assessment.session_reference}</span>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">{assessment.weight_percent}%</span>
              </div>
              <p className="mt-1.5 text-xs font-bold text-slate-900">{assessment.name}</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-600">{assessment.description}</p>
            </div>
          ))}
        </div>
      </section>

      {loadError && <p role="status" className="mb-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{loadError}</p>}

      <section id="module-directory">
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Module directory</h2>
              <p className="mt-0.5 text-xs text-slate-500">8 modules · 4 two-hour sessions per module · standard 120-min 4-block structure</p>
            </div>
            <button type="button" onClick={toggleAll} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              {allExpanded ? 'Collapse all details' : 'Expand all details'}
            </button>
          </div>
          <nav aria-label="Jump to module" className="flex flex-wrap gap-2">
            {b1Curriculum.modules.map((module) => (
              <a key={module.module_number} href={`#module-${module.module_number}`} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700">
                M{module.module_number}
              </a>
            ))}
          </nav>
          <div role="group" aria-label="Filter modules by focus" className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                aria-pressed={filter === item}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === item ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {visibleModules.map((module) => {
            const isExpanded = expandedModules.includes(module.module_number);
            const moduleCompleted = module.lessons.filter((lesson) => completed.has(`${module.module_number}:${lesson.lesson_number}`)).length;
            const active = lessonProgress.some((item) => item.module_number === module.module_number && item.status === 'in_progress');
            return (
              <article id={`module-${module.module_number}`} key={module.module_number} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm font-bold text-indigo-700">
                      {String(module.module_number).padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900">{module.title}</h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {module.session_range} · {module.estimated_hours} hours · {moduleCompleted}/4 sessions complete
                      </p>
                      <p className="mt-1 text-xs text-slate-600">{module.core_focus}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`hidden rounded-full px-2.5 py-1 text-xs font-semibold sm:inline-flex ${moduleCompleted === 4 ? 'bg-emerald-100 text-emerald-800' : active ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600'}`}>
                      {moduleCompleted === 4 ? 'Complete' : active ? 'In progress' : 'Not started'}
                    </span>
                    <button type="button" aria-expanded={isExpanded} aria-controls={`module-details-${module.module_number}`} onClick={() => toggleModule(module.module_number)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      {isExpanded ? 'Hide details' : 'Can-Do'}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {module.lessons.map((lesson) => {
                    const done = completed.has(`${module.module_number}:${lesson.lesson_number}`);
                    return (
                      <div key={lesson.session_number} className={`rounded-xl border p-3 transition ${done ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30'}`}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-indigo-700">Session {lesson.session_number}</span>
                          <span className="text-[11px] text-slate-500">Hrs {lesson.course_hour - 1}–{lesson.course_hour}</span>
                        </div>
                        <Link href={`/curriculum/modules/${module.module_number}/lessons/${lesson.lesson_number}`} className="mt-1 block text-xs font-semibold text-slate-900 hover:text-indigo-700">
                          {lesson.title}
                        </Link>
                        {lesson.milestone && (
                          <span className="mt-1.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                            {lesson.milestone}
                          </span>
                        )}
                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                          <Link href={`/curriculum/modules/${module.module_number}/lessons/${lesson.lesson_number}`} className="font-semibold text-indigo-700 hover:underline">
                            Study + Labs →
                          </Link>
                          <Link href={`/lessons/${lesson.session_id}`} className="text-slate-500 hover:text-indigo-700 hover:underline">
                            4-Block View
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-500">Grammar</span>
                  {module.target_grammar.map((item) => (
                    <span key={item} className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{item}</span>
                  ))}
                  <span className="ml-1 font-semibold text-slate-500">Vocabulary</span>
                  {module.target_vocabulary.map((item) => (
                    <span key={item} className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">{item}</span>
                  ))}
                </div>

                {isExpanded && (
                  <div id={`module-details-${module.module_number}`} className="mt-4 border-t border-slate-100 pt-4">
                    <h4 className="text-sm font-bold text-slate-800">Can-Do objectives</h4>
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                      {skills.map((skill) => (
                        <li key={skill} className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                          <span className="mr-1.5 inline-flex min-w-7 justify-center rounded bg-white px-1.5 py-0.5 font-bold text-indigo-700">{abbreviations[skill]}</span>
                          {canDoText(module, skill)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            );
          })}
          {!visibleModules.length && (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No modules match this focus filter.</p>
          )}
        </div>
      </section>
    </main>
  );
}

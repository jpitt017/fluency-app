'use client';

import Link from 'next/link';
import { useState } from 'react';
import { b1Curriculum, type CurriculumLesson, type CurriculumModule } from '@/lib/curriculum';

const BLOCK_STYLES: Record<string, string> = {
  pronunciation: 'border-l-4 border-l-indigo-500',
  language: 'border-l-4 border-l-emerald-500',
  listening: 'border-l-4 border-l-amber-500',
  speaking: 'border-l-4 border-l-purple-500',
};

const BLOCK_BADGES: Record<string, string> = {
  pronunciation: 'bg-indigo-50 text-indigo-700',
  language: 'bg-emerald-50 text-emerald-700',
  listening: 'bg-amber-50 text-amber-800',
  speaking: 'bg-purple-50 text-purple-700',
};

export default function CurriculumLessonClient({
  module,
  lesson,
}: {
  module: CurriculumModule;
  lesson: CurriculumLesson;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [progressSaved, setProgressSaved] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [error, setError] = useState('');

  const nextLesson = module.lessons.find((item) => item.lesson_number === lesson.lesson_number + 1);
  const nextModule = module.module_number < 8 ? b1Curriculum.modules[module.module_number] : null;
  const nextHref = nextLesson
    ? `/curriculum/modules/${module.module_number}/lessons/${nextLesson.lesson_number}`
    : nextModule
      ? `/curriculum/modules/${nextModule.module_number}/lessons/1`
      : '/curriculum';

  const totalQuestions = lesson.blocks.reduce(
    (sum, block) => sum + block.content.exercises.length,
    0,
  );
  const correctCount = lesson.blocks.reduce(
    (sum, block) =>
      sum +
      block.content.exercises.filter(
        (ex, idx) => answers[`${block.block_number}:${idx}`] === ex.answer,
      ).length,
    0,
  );

  async function markSessionComplete() {
    setSavingProgress(true);
    setError('');
    try {
      const score = totalQuestions ? Math.round((correctCount / totalQuestions) * 100) : 100;
      const res = await fetch('/api/curriculum/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleNumber: module.module_number,
          lessonNumber: lesson.lesson_number,
          completed: true,
          score,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Sign in to save session completion to your progress passport.');
      }
      setProgressSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save session progress.');
    } finally {
      setSavingProgress(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/curriculum" className="text-sm font-medium text-indigo-700 hover:underline">
          ← All modules
        </Link>
        <Link
          href={`/lessons/${lesson.session_id}`}
          className="text-xs font-semibold text-slate-600 hover:text-indigo-700 hover:underline"
        >
          Open 4-Block Session Viewer →
        </Link>
      </div>

      <header className="mt-4 rounded-2xl bg-slate-900 p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-300">
            Module {module.module_number}: {module.title} · Session {lesson.session_number}/32
          </p>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-indigo-200">
            {lesson.duration_minutes} min · Hours {lesson.course_hour - 1}–{lesson.course_hour}
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-bold">{lesson.title}</h1>
        <p className="mt-1 text-sm text-slate-300">
          {lesson.unit_title} · {lesson.stage}
        </p>
        <p className="mt-3 text-sm text-slate-200">{lesson.objectives}</p>
        {lesson.milestone && (
          <p className="mt-3 inline-block rounded-full bg-amber-400/20 px-3 py-1 text-xs font-semibold text-amber-200">
            Assessment Milestone: {lesson.milestone}
          </p>
        )}
      </header>

      <section className="mt-6 space-y-5" aria-label="120-minute four-block session plan">
        {lesson.blocks.map((block) => (
          <article
            key={block.block_number}
            className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${BLOCK_STYLES[block.block_type] ?? ''}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Block {block.block_number} · {String(block.start_minute).padStart(2, '0')}–{block.end_minute} min
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${BLOCK_BADGES[block.block_type] ?? 'bg-slate-100 text-slate-700'}`}>
                {block.block_type}
              </span>
            </div>

            <h2 className="mt-2 text-lg font-bold text-slate-900">{block.title}</h2>
            <p className="mt-1 text-sm text-slate-700">{block.description}</p>

            {block.content.model_extract && (
              <blockquote className="mt-3 rounded-lg border-l-4 border-indigo-400 bg-indigo-50/70 px-4 py-3 text-sm italic text-indigo-950">
                Model Extract: {block.content.model_extract}
              </blockquote>
            )}

            {block.content.key_points.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
                {block.content.key_points.map((point, idx) => (
                  <li key={idx}>{point}</li>
                ))}
              </ul>
            )}

            {block.content.exercises.length > 0 && (
              <div className="mt-4 space-y-3">
                {block.content.exercises.map((ex, idx) => {
                  const key = `${block.block_number}:${idx}`;
                  const chosen = answers[key];
                  return (
                    <fieldset key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <legend className="px-1 text-sm font-semibold text-slate-900">
                        {idx + 1}. {ex.question}
                      </legend>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {ex.options.map((option) => {
                          const isChosen = chosen === option;
                          const isCorrect = option === ex.answer;
                          let style = 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100';
                          if (chosen !== undefined) {
                            if (isCorrect) style = 'border-emerald-500 bg-emerald-50 text-emerald-900 font-medium';
                            else if (isChosen) style = 'border-rose-400 bg-rose-50 text-rose-900';
                          }
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setAnswers((prev) => ({ ...prev, [key]: option }))}
                              aria-pressed={isChosen}
                              className={`rounded-lg border px-3 py-2 text-left text-sm transition ${style}`}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                      {chosen !== undefined && (
                        <p className={`mt-2 text-xs font-medium ${chosen === ex.answer ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {chosen === ex.answer ? '✓ Correct.' : `✗ Expected: ${ex.answer}.`} {ex.explanation}
                        </p>
                      )}
                    </fieldset>
                  );
                })}
              </div>
            )}
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
          Homework & Audio Journal / Shadowing Log
        </h2>
        <p className="mt-2 text-sm text-slate-800">{lesson.homework}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="text-xs font-medium text-slate-600">
            Self-check score: {correctCount}/{totalQuestions} correct
          </p>
          <button
            type="button"
            onClick={markSessionComplete}
            disabled={savingProgress}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {savingProgress ? 'Saving…' : progressSaved ? 'Session Completed ✓' : 'Mark Session Complete'}
          </button>
        </div>
        {error && <p role="alert" className="mt-3 rounded bg-amber-50 p-2.5 text-xs text-amber-800">{error}</p>}
        {progressSaved && (
          <p role="status" className="mt-3 rounded bg-emerald-50 p-2.5 text-xs font-medium text-emerald-800">
            Session {lesson.session_number} saved to your learning progress.
          </p>
        )}
      </section>

      <div className="mt-6 flex justify-end">
        <Link href={nextHref} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          {nextLesson
            ? `Next: Session ${nextLesson.session_number} →`
            : nextModule
              ? `Next: Module ${nextModule.module_number} →`
              : 'Back to curriculum'}
        </Link>
      </div>
    </main>
  );
}

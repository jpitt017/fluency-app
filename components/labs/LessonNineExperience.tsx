'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { CurriculumLesson, CurriculumModule } from '@/lib/curriculum';
import WritingLab from '@/components/labs/WritingLab';
import type { LessonLabContext } from '@/components/labs/LessonLabContext';

const drills = [
  {
    prompt: 'Maya usually ___ the train to work.',
    options: ['takes', 'is taking'],
    answer: 'takes',
    note: 'Use the present simple for a regular routine, often signalled by “usually”.',
  },
  {
    prompt: 'Today she ___ because of the rail strike.',
    options: ['drives', 'is driving'],
    answer: 'is driving',
    note: 'Use the present continuous for a temporary situation happening around now.',
  },
  {
    prompt: 'I ___ what you mean.',
    options: ["don't understand", "am not understanding"],
    answer: "don't understand",
    note: '“Understand” is usually a stative verb, so use the present simple.',
  },
];

export default function LessonNineExperience({ module, lesson }: { module: CurriculumModule; lesson: CurriculumLesson }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const prompt = 'Write 3–4 sentences comparing what you usually do on weekdays with what you are doing differently this week. Include at least one daily routine or personality adjective.';
  const labContext: LessonLabContext = {
    moduleId: module.module_number,
    lessonId: lesson.lesson_number,
    prompt,
    targetGrammar: ['Present simple for routines', 'Present continuous for temporary situations', 'Stative verbs'],
    targetVocabulary: ['daily routines', 'personality adjectives'],
    cefrSkill: 'Writing',
    mode: 'drill',
    minWords: 1,
    maxWords: 1500,
    onComplete: async ({ score }) => {
      await fetch('/api/curriculum/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleNumber: module.module_number, lessonNumber: lesson.lesson_number, completed: true, score }),
      });
    },
  };

  const allCorrect = drills.every((drill, index) => answers[index] === drill.answer);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:py-10">
      <header className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/curriculum" className="text-sm font-semibold text-indigo-700 hover:underline">← All modules</Link>
          <p className="text-xs font-medium text-slate-500">Module {module.module_number} · Lesson {lesson.lesson_number}/32 · {lesson.duration_minutes} min · {lesson.stage} · Course hour {lesson.course_hour}</p>
        </div>
        <h1 className="mt-4 text-3xl font-bold text-slate-950">Present Simple or Continuous?</h1>
        <p className="mt-1 text-sm text-slate-600">Identity, Lifestyle &amp; Habits</p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-5">
          <section aria-labelledby="grammar-rule" className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Step 1 · Grammar rule</p>
            <h2 id="grammar-rule" className="mt-1 text-lg font-bold text-slate-900">Routine or temporary situation?</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white p-4"><h3 className="text-sm font-bold text-slate-900">Present simple</h3><p className="mt-1 text-sm text-slate-600">Use it for routines, habits and facts.</p><p className="mt-2 text-sm font-medium text-indigo-800">I usually take the train.</p></div>
              <div className="rounded-xl bg-white p-4"><h3 className="text-sm font-bold text-slate-900">Present continuous</h3><p className="mt-1 text-sm text-slate-600">Use it for actions happening now or temporary situations.</p><p className="mt-2 text-sm font-medium text-indigo-800">This week, I’m working from home.</p></div>
            </div>
            <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><strong>Stative verb reminder:</strong> verbs such as <em>know, prefer</em> and <em>need</em> usually stay in the simple form: “I understand”, not “I’m understanding”.</p>
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Lesson targets">
              {['Present simple vs. continuous', 'State verbs', 'Daily routines', 'Personality adjectives'].map((tag) => <span key={tag} className="rounded-full border border-white bg-white/80 px-2.5 py-1 text-xs text-slate-600">{tag}</span>)}
            </div>
          </section>

          <section aria-labelledby="grammar-drill" className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Step 2 · Quick grammar check</p>
            <h2 id="grammar-drill" className="mt-1 text-lg font-bold text-slate-900">Choose the correct form</h2>
            <div className="mt-4 space-y-3">
              {drills.map((drill, index) => {
                const selected = answers[index];
                const correct = selected === drill.answer;
                return <fieldset key={drill.prompt} className="rounded-xl border border-slate-200 p-3">
                  <legend className="px-1 text-sm font-medium text-slate-800">{index + 1}. {drill.prompt}</legend>
                  <div className="mt-2 flex flex-wrap gap-2">{drill.options.map((option) => <button key={option} type="button" aria-pressed={selected === option} onClick={() => setAnswers((current) => ({ ...current, [index]: option }))} className={`rounded-lg border px-3 py-1.5 text-sm ${selected === option ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>{option}</button>)}</div>
                  {selected && <p className={`mt-2 text-xs ${correct ? 'text-emerald-700' : 'text-rose-700'}`}>{correct ? `Correct. ${drill.note}` : 'Not quite—try again.'}</p>}
                </fieldset>;
              })}
            </div>
            <p aria-live="polite" className={`mt-3 text-sm font-semibold ${allCorrect ? 'text-emerald-700' : 'text-slate-500'}`}>{allCorrect ? 'Great work—you have the contrast.' : 'Answer all three to complete the grammar check.'}</p>
          </section>
        </div>

        <section aria-labelledby="writing-lab-title" className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Step 3 · Lesson lab</p><h2 id="writing-lab-title" className="mt-1 text-lg font-bold text-slate-900">Targeted writing practice</h2></div><Link href="/labs" className="text-xs font-semibold text-indigo-700 hover:underline">Open full /labs sandbox ↗</Link></div>
          <WritingLab lessonContext={labContext} />
        </section>
      </div>

      <nav aria-label="Lesson navigation" className="mt-7 flex items-center justify-between border-t border-slate-200 pt-5">
        <Link href={`/curriculum/modules/${module.module_number}/lessons/${lesson.lesson_number - 1}`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white">← Lesson {lesson.lesson_number - 1}</Link>
        <Link href={`/curriculum/modules/${module.module_number}/lessons/${lesson.lesson_number + 1}`} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Next lesson: Lesson {lesson.lesson_number + 1} →</Link>
      </nav>
    </main>
  );
}

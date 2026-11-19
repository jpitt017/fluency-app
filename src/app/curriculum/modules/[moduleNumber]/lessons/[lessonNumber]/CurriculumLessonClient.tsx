'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { getLessonActivity, type CurriculumLesson, type CurriculumModule } from '@/lib/curriculum';

export default function CurriculumLessonClient({ module, lesson }: { module: CurriculumModule; lesson: CurriculumLesson }) {
  const activity = useMemo(() => getLessonActivity(lesson.stage, lesson.title), [lesson]);
  const [response, setResponse] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{ passed: boolean; mastery: number; rubric: Record<string, unknown>; reviewDeck?: string[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isCheckpoint = lesson.stage === 'CEFR Can-Do Checkpoint' && lesson.lesson_number === 32;

  async function submitCheckpoint() {
    setBusy(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/checkpoints/evaluate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleNumber: module.module_number,
          objectiveId: `B1_M${module.module_number}_SI`,
          transcript: response,
          durationSeconds: Math.max(module.checkpoint_task.min_duration_seconds, Math.round(response.trim().split(/\s+/).length / 1.8 * 60)),
          targetStructures: module.target_grammar,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to evaluate this checkpoint.');
      setResult(data); setSubmitted(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Checkpoint evaluation failed.'); }
    finally { setBusy(false); }
  }

  const nextLesson = module.lessons.find((item) => item.lesson_number === lesson.lesson_number + 1);
  const nextModule = module.module_number < 8 ? b1Curriculum.modules[module.module_number] : null;
  const nextHref = nextLesson ? `/curriculum/modules/${module.module_number}/lessons/${nextLesson.lesson_number}`
    : nextModule ? `/curriculum/modules/${nextModule.module_number}/lessons/1` : '/curriculum';

  return <main className="mx-auto max-w-3xl px-4 py-10">
    <Link href="/curriculum" className="text-sm font-medium text-indigo-700 hover:text-indigo-900">← All modules</Link>
    <header className="mt-6 rounded-2xl bg-slate-900 p-6 text-white">
      <p className="text-xs font-bold uppercase tracking-widest text-indigo-300">Module {module.module_number} · Lesson {lesson.lesson_number}/32 · {lesson.duration_minutes} min</p>
      <h1 className="mt-2 text-2xl font-bold">{lesson.title}</h1>
      <p className="mt-2 text-sm text-slate-300">{lesson.stage} · Course hour {lesson.course_hour}</p>
    </header>

    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-bold text-slate-900">Your activity</h2><p className="mt-2 text-slate-700">{activity.instruction}</p>
      <div className="mt-5 rounded-xl bg-indigo-50 p-4"><p className="text-xs font-bold uppercase text-indigo-700">Your task</p><p className="mt-1 text-sm text-indigo-950">{activity.task}</p></div>
      <div className="mt-5"><h3 className="text-sm font-bold text-slate-800">Target grammar</h3><div className="mt-2 flex flex-wrap gap-2">{lesson.grammar.map((item) => <span key={item} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{item}</span>)}</div></div>
      <div className="mt-4"><h3 className="text-sm font-bold text-slate-800">Vocabulary</h3><div className="mt-2 flex flex-wrap gap-2">{lesson.vocabulary.map((item) => <span key={item} className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-800">{item}</span>)}</div></div>
    </section>

    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      <label htmlFor="lesson-response" className="block text-sm font-bold text-slate-900">{isCheckpoint ? 'Checkpoint response transcript' : 'Practice response'}</label>
      <p className="mt-1 text-xs text-slate-500">{isCheckpoint ? 'For this first checkpoint version, paste a transcript of your spoken response (minimum 120 seconds). Audio recording upload will be added next.' : 'Write or dictate a response to practise this lesson. Your text stays in this browser unless you submit a checkpoint.'}</p>
      {isCheckpoint && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{module.checkpoint_task.prompt}</p>}
      <textarea id="lesson-response" value={response} onChange={(event) => setResponse(event.target.value)} rows={8} className="mt-3 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" placeholder="Type your response here…" />
      {isCheckpoint ? <button type="button" onClick={submitCheckpoint} disabled={busy || response.trim().split(/\s+/).filter(Boolean).length < 20} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Evaluating…' : 'Submit CEFR checkpoint'}</button> : <button type="button" onClick={() => setSubmitted(true)} disabled={!response.trim()} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">Mark practice complete</button>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {submitted && !isCheckpoint && <p role="status" className="mt-3 text-sm font-medium text-emerald-700">Practice marked complete on this device.</p>}
      {result && <div role="status" className="mt-4 rounded-xl border border-slate-200 p-4"><h3 className={result.passed ? 'font-bold text-emerald-700' : 'font-bold text-amber-700'}>{result.passed ? 'Can-Do achieved!' : 'Not quite yet — review and retry.'}</h3><p className="mt-1 text-sm text-slate-700">Objective mastery: {result.mastery}%</p><pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-slate-600">{JSON.stringify(result.rubric, null, 2)}</pre>{!result.passed && result.reviewDeck?.length ? <div className="mt-3"><h4 className="text-sm font-semibold">Targeted review deck</h4><ul className="mt-1 list-disc pl-5 text-sm text-slate-700">{result.reviewDeck.map((card, index) => <li key={index}>{card}</li>)}</ul></div> : null}</div>}
    </section>

    {(submitted || !isCheckpoint) && <div className="mt-6 flex justify-end"><Link href={nextHref} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">{nextLesson ? 'Next lesson →' : nextModule ? 'Next module →' : 'Back to curriculum'}</Link></div>}
  </main>;
}

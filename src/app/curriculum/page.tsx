'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { b1Curriculum, curriculumStages, type CefrSkill } from '@/lib/curriculum';

type ObjectiveProgress = { objective_id: string; mastery: number };
type Checkpoint = { id: string; module_number: number; passed: boolean; rubric: Record<string, unknown>; transcript: string | null; created_at: string };
const skillAbbreviation: Record<CefrSkill, string> = { Listening: 'L', Reading: 'R', 'Spoken Interaction': 'SI', 'Spoken Production': 'SP', Writing: 'WR' };

export default function CurriculumPage() {
  const [progress, setProgress] = useState<ObjectiveProgress[]>([]);
  const [portfolio, setPortfolio] = useState<Checkpoint[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const supabase = createClient();
    async function loadPassport() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [mastery, attempts] = await Promise.all([
        supabase.from('cefr_objective_progress').select('objective_id,mastery').eq('user_id', user.id),
        supabase.from('cefr_checkpoint_attempts').select('id,module_number,passed,rubric,transcript,created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
      ]);
      if (mastery.error || attempts.error) {
        setLoadError('Progress Passport tables are not available yet. Apply the CEFR curriculum migration to enable saved progress.');
        return;
      }
      setProgress(mastery.data ?? []);
      setPortfolio(attempts.data ?? []);
    }
    loadPassport().catch(() => setLoadError('Unable to load your Progress Passport.'));
  }, []);

  const masteryById = new Map(progress.map((item) => [item.objective_id, item.mastery]));
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">CEFR B1 · 64 hours</p>
        <h1 className="text-3xl font-bold text-slate-950">Fluency Curriculum</h1>
        <p className="mt-2 max-w-2xl text-slate-600">Eight modules. Thirty-two micro-lessons per module, with a repeatable four-stage learning loop.</p>
      </header>

      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-bold text-slate-900">CEFR skill mastery</h2>
        <p className="mt-1 text-sm text-slate-600">Your objective bars update after checkpoint attempts.</p>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {(['Listening', 'Reading', 'Spoken Interaction', 'Spoken Production', 'Writing'] as CefrSkill[]).map((skill) => {
            const skillObjectives = b1Curriculum.modules.flatMap((module) => module.cefr_objectives.filter((objective) => objective.skill === skill));
            const mastery = skillObjectives.length ? Math.round(skillObjectives.reduce((total, objective) => total + (masteryById.get(objective.id) ?? 0), 0) / skillObjectives.length) : 0;
            return <div key={skill}>
              <div className="mb-1 flex justify-between text-sm"><span className="font-medium text-slate-700">{skill}</span><span className="text-slate-500">{mastery}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${mastery}%` }} /></div>
            </div>;
          })}
        </div>
        {loadError && <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{loadError}</p>}
      </section>

      <div className="grid gap-6">
        {b1Curriculum.modules.map((module) => (
          <section key={module.module_number} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div><p className="text-xs font-bold uppercase text-slate-400">Module {module.module_number} · 8 hours</p><h2 className="mt-1 text-xl font-bold text-slate-900">{module.title}</h2></div>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">32 micro-lessons</span>
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div><h3 className="text-sm font-bold text-slate-800">Target grammar</h3><ul className="mt-2 flex flex-wrap gap-2">{module.target_grammar.map((item) => <li key={item} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{item}</li>)}</ul></div>
              <div><h3 className="text-sm font-bold text-slate-800">Target vocabulary</h3><ul className="mt-2 flex flex-wrap gap-2">{module.target_vocabulary.map((item) => <li key={item} className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800">{item}</li>)}</ul></div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {curriculumStages.map((stage, stageIndex) => {
                const lessons = module.lessons.filter((lesson) => lesson.stage === stage);
                return <Link key={stage} href={`/curriculum/modules/${module.module_number}/lessons/${lessons[0].lesson_number}`} className="rounded-xl border border-slate-200 p-4 transition hover:border-indigo-300 hover:shadow-sm">
                  <p className="text-xs font-bold text-indigo-600">Hours {stageIndex * 2 + 1}–{stageIndex * 2 + 2}</p><h3 className="mt-1 font-semibold text-slate-900">{stage}</h3><p className="mt-2 text-xs text-slate-500">Lessons {lessons[0].lesson_number}–{lessons.at(-1)?.lesson_number}</p>
                </Link>;
              })}
            </div>
            <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-bold text-slate-800">Can-do objectives</h3><ul className="mt-2 grid gap-2 sm:grid-cols-2">{module.cefr_objectives.map((objective) => <li key={objective.id} className="text-xs text-slate-600"><span className="font-semibold text-indigo-700">{skillAbbreviation[objective.skill]}</span> · {objective.can_do}</li>)}</ul></div>
          </section>
        ))}
      </div>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-bold text-slate-900">Progress Passport</h2><p className="mt-1 text-sm text-slate-600">Checkpoint transcripts and achievements are collected here for your review.</p>
        {portfolio.length === 0 ? <p className="mt-4 text-sm text-slate-500">No checkpoint submissions yet.</p> : <ul className="mt-4 space-y-3">{portfolio.map((attempt) => <li key={attempt.id} className="rounded-lg border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2"><strong>Module {attempt.module_number}</strong><span className={attempt.passed ? 'text-sm font-semibold text-emerald-700' : 'text-sm font-semibold text-amber-700'}>{attempt.passed ? 'Can-Do achieved' : 'Review recommended'}</span></div>{attempt.transcript && <details className="mt-2"><summary className="cursor-pointer text-sm text-indigo-700">View saved transcript</summary><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{attempt.transcript}</p></details>}</li>)}</ul>}
      </section>
    </main>
  );
}

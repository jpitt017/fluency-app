'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Flag, Search, SlidersHorizontal } from 'lucide-react';

export interface ExplorerWeek {
  number: number;
  stage: number;
  phase: string;
  theme: string;
  mainGrammar: string;
  secondaryGrammarLabel: string;
  secondaryGrammar: string | null;
  skillsFocus: string | null;
}

export interface ExplorerStage {
  number: number;
  title: string;
  weekRange: string;
  weeks: number;
  hours: number;
  startingLevel: string;
  aim: string;
  phases: { weeks: string; focus: string }[];
}

export interface ExplorerCheckpoint {
  number: number;
  stage: number;
  afterWeek: number;
}

const REQUIREMENT_LABEL: Record<string, string> = {
  optional: 'Not required',
  either: 'Listening or reading',
  required: 'Required',
  recommended: 'Recommended',
};

export default function CurriculumExplorer({
  weeks,
  stages,
  checkpoints,
}: {
  weeks: ExplorerWeek[];
  stages: ExplorerStage[];
  checkpoints: ExplorerCheckpoint[];
}) {
  const [stageNumber, setStageNumber] = useState(1);
  const [phase, setPhase] = useState('all');
  const [query, setQuery] = useState('');

  const stage = stages.find((item) => item.number === stageNumber) ?? stages[0];
  const checkpointWeeks = useMemo(
    () => new Set(checkpoints.filter((cp) => cp.stage === stageNumber).map((cp) => cp.afterWeek)),
    [checkpoints, stageNumber],
  );

  const visibleWeeks = weeks.filter((week) => {
    if (week.stage !== stageNumber) return false;
    if (phase !== 'all' && week.phase !== phase) return false;
    if (!query.trim()) return true;
    const haystack = `${week.theme} ${week.mainGrammar} ${week.secondaryGrammar ?? ''} ${week.skillsFocus ?? ''}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <section id="weeks" className="scroll-mt-28 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-700">Week by week</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-900 sm:text-3xl">The 32-week plan</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
            Every week has the same task shape. The theme, grammar and target lengths change; your review queue is built from your own mistakes.
          </p>
        </div>
        <Link
          href="/onboarding/placement"
          className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-2xs transition hover:border-indigo-300 hover:text-indigo-800"
        >
          Not sure where to start? Placement check
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {stages.map((item) => (
          <button
            key={item.number}
            type="button"
            onClick={() => {
              setStageNumber(item.number);
              setPhase('all');
            }}
            aria-pressed={item.number === stageNumber}
            className={`rounded-2xl border p-4 text-left transition ${
              item.number === stageNumber
                ? 'border-indigo-300 bg-indigo-50/60 shadow-sm ring-1 ring-indigo-200'
                : 'border-stone-200 bg-white hover:border-indigo-200 hover:bg-stone-50'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${item.number === stageNumber ? 'text-indigo-700' : 'text-stone-500'}`}>
                Stage {item.number} · Weeks {item.weekRange}
              </span>
              <span className="rounded-full border border-stone-200 bg-white px-2 py-0.5 font-mono text-[10px] text-stone-600">
                {item.hours}h
              </span>
            </div>
            <p className="mt-2 font-serif text-lg font-semibold text-stone-900">{item.aim}</p>
            <p className="mt-1 text-xs leading-5 text-stone-600">Start: {item.startingLevel}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white/80 p-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-500">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Phase
        </div>
        <button
          type="button"
          onClick={() => setPhase('all')}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${phase === 'all' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
        >
          All {stage.weeks} weeks
        </button>
        {stage.phases.map((item) => (
          <button
            key={item.weeks}
            type="button"
            onClick={() => setPhase(item.weeks)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${phase === item.weeks ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
            title={item.focus}
          >
            Wk {item.weeks}
          </button>
        ))}
        <label className="ml-auto flex min-w-[190px] items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-stone-400" />
          <span className="sr-only">Search weeks</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search theme or grammar"
            className="w-full bg-transparent text-xs text-stone-800 outline-none placeholder:text-stone-400"
          />
        </label>
      </div>

      {visibleWeeks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
          No weeks match that search. Try a theme, grammar point or skill.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleWeeks.map((week) => (
            <Link
              key={week.number}
              href={`/curriculum/weeks/${week.number}`}
              className="group flex flex-col rounded-2xl border border-stone-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(24,24,27,0.04)] transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-indigo-700 px-2 py-0.5 font-mono text-[11px] font-semibold text-white">
                    WEEK {String(week.number).padStart(2, '0')}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Phase {week.phase}</span>
                </div>
                {checkpointWeeks.has(week.number) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    <Flag className="h-3 w-3" />
                    Checkpoint
                  </span>
                )}
              </div>

              <h3 className="mt-3 font-serif text-lg font-semibold leading-snug text-stone-900 group-hover:text-indigo-800">
                {week.theme}
              </h3>

              <dl className="mt-3 space-y-2 border-t border-stone-100 pt-3 text-xs">
                <div>
                  <dt className="font-bold uppercase tracking-wider text-stone-400">Main grammar</dt>
                  <dd className="mt-0.5 leading-5 text-stone-700">{week.mainGrammar}</dd>
                </div>
                {week.secondaryGrammar && (
                  <div>
                    <dt className="font-bold uppercase tracking-wider text-stone-400">{week.secondaryGrammarLabel}</dt>
                    <dd className="mt-0.5 leading-5 text-stone-700">{week.secondaryGrammar}</dd>
                  </div>
                )}
                {week.skillsFocus && (
                  <div>
                    <dt className="font-bold uppercase tracking-wider text-stone-400">Skills focus</dt>
                    <dd className="mt-0.5 leading-5 text-stone-700">{week.skillsFocus}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-auto flex items-center justify-between pt-4 text-[11px] font-semibold text-indigo-700">
                <span>Open week</span>
                <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="text-center text-[11px] text-stone-500">
        {REQUIREMENT_LABEL.required} to move on: speaking task, writing task, and either listening or reading.
      </p>
    </section>
  );
}

'use client';

import { useMemo, useState } from 'react';
import type { LearnerGrammar, LearnerGrammarItem, LearnerGrammarStep } from '@/lib/curriculum/learner-grammar';
import { visibleItems } from '@/lib/curriculum/grammar-branch.mjs';
import {
  canFinish as canFinishRule,
  finishHint,
  nextTaskAfter,
  resumeStep,
  unmarkedRequired,
} from '@/lib/curriculum/week-practice.mjs';
import type { PracticeProgress } from '@/lib/curriculum/week-practice-progress';
import SentenceBox from './SentenceBox';
import { FinishSummary, SavedTick } from './PracticeFeedback';

type Marked = { correct: boolean; reason: string | null };

function ProgressBar({ current, total, title }: { current: number; total: number; title: string }) {
  const percent = Math.round((current / total) * 100);
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-stone-700">
        Step {current} of {total}: {title}
      </p>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-stone-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label={`Step ${current} of ${total}`}
      >
        <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function Item({
  item,
  week,
  signedIn,
  saved,
  onMarked,
}: {
  item: LearnerGrammarItem;
  week: number;
  signedIn: boolean;
  /** The saved answer from the server, when there is one. */
  saved?: Marked & { answer: string };
  onMarked: (id: string, correct: boolean) => void;
}) {
  const [answer, setAnswer] = useState<string[]>(() => {
    const blanks = Array(Math.max(1, item.blankCount)).fill('');
    if (!saved) return blanks;
    // A multi-blank answer is stored as one string joined by an ellipsis, the
    // same way a multiple-choice option writes it ("Have ... lived").
    if (item.blankCount > 1) {
      const parts = saved.answer.split(/\s*\.{3}\s*/);
      return blanks.map((value, index) => parts[index] ?? value);
    }
    return [saved.answer];
  });
  const [marked, setMarked] = useState<Marked | null>(saved ? { correct: saved.correct, reason: saved.reason } : null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState(false);

  // Rewrite items and the "Use it" sentences are marked by the app, against the
  // week's target grammar rather than one key. Both get the same box, and the
  // result is reported back so the adaptive rules still see the outcome.
  if (item.needsAi) {
    return (
      <SentenceBox
        week={week}
        id={item.id}
        prompt={item.prompt}
        signedIn={signedIn}
        rows={item.step === 'Use it' ? 3 : 2}
        initialAnswer={saved?.answer}
        onChecked={(onTarget) => {
          setSavedAt(true);
          onMarked(item.id, onTarget);
        }}
      />
    );
  }

  const isChoice = item.options.length > 0;

  async function check() {
    setError('');
    setBusy(true);
    setSavedAt(false);
    try {
      const value = item.blankCount > 1 && !isChoice ? answer : answer[0];
      const response = await fetch('/api/week/grammar/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, id: item.id, answer: value }),
      });
      const data = (await response.json()) as Marked & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not check your answer.');
      setMarked(data);
      setSavedAt(true);
      onMarked(item.id, data.correct);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check your answer.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl bg-stone-50 p-4">
      <p className="font-medium">{item.prompt}</p>
      {isChoice ? (
        <div className="space-y-1">
          {item.options.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${item.id}-options`}
                checked={answer[0] === option}
                onChange={() => {
                  setAnswer([option]);
                  setMarked(null);
                  setSavedAt(false);
                }}
              />
              {option}
            </label>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {answer.map((value, index) => (
            <input
              key={index}
              value={value}
              maxLength={500}
              aria-label={item.blankCount > 1 ? `Blank ${index + 1}` : 'Your answer'}
              onChange={(event) => {
                const next = [...answer];
                next[index] = event.target.value;
                setAnswer(next);
                setMarked(null);
                setSavedAt(false);
              }}
              className="min-w-40 flex-1 rounded-lg border border-stone-300 bg-white p-2"
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!signedIn || busy || answer.every((part) => !part.trim())}
          onClick={check}
          className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Check'}
        </button>
        <SavedTick saved={savedAt} error={error || undefined} saving={busy} />
      </div>
      {marked && (
        <div role="status" className={marked.correct ? 'text-emerald-800' : 'text-amber-900'}>
          <strong>{marked.correct ? 'Correct! ' : 'Not quite. '}</strong>
          {marked.reason}
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export default function GrammarPractice({
  grammar,
  week,
  signedIn,
  progress,
  hasVocabulary,
}: {
  grammar: LearnerGrammar;
  week: number;
  signedIn: boolean;
  /** What the server has saved for this learner, so a reload starts where they stopped. */
  progress?: PracticeProgress | null;
  hasVocabulary?: boolean;
}) {
  const steps = grammar.steps;
  const restored = useMemo<Record<string, boolean>>(() => {
    const results: Record<string, boolean> = {};
    for (const [id, saved] of Object.entries(progress?.answers ?? {})) results[id] = saved.correct;
    return results;
  }, [progress]);
  // Open where the learner stopped. With nothing saved the saved results are
  // empty, so resumeStep returns 0 and the section starts at "See it".
  const [index, setIndex] = useState(() =>
    Math.min(progress?.step ?? resumeStep(steps, restored), Math.max(0, steps.length - 1)),
  );
  const [results, setResults] = useState<Record<string, boolean>>(restored);
  const [summary, setSummary] = useState(progress?.summary ?? null);
  const [busy, setBusy] = useState(false);
  const [finishError, setFinishError] = useState('');
  const current: LearnerGrammarStep = steps[Math.min(index, steps.length - 1)];

  /**
   * The adaptive rules are applied to the results the server restored, not only
   * to what the browser has seen: a learner who reloads mid-practice gets the
   * same silent branch they were on.
   */
  const shown = useMemo(() => visibleItems(current, steps, results), [current, steps, results]);

  const allItems = useMemo(
    () => steps.flatMap((step) => step.items),
    [steps],
  );
  // The plan's optional/counted flags, matching week-practice-plan.ts.
  const planned = useMemo(
    () =>
      allItems.map((item) => ({
        id: item.id,
        optional: item.needsAi || item.target === 'Extra',
        counted: !item.needsAi && item.target !== 'Extra',
      })),
    [allItems],
  );
  const remaining = unmarkedRequired(planned, results).length;
  const lastStep = index === steps.length - 1;
  const next = nextTaskAfter('grammar', { hasVocabulary });

  async function finish() {
    setBusy(true);
    setFinishError('');
    try {
      const response = await fetch('/api/week/practice/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, skill: 'grammar' }),
      });
      const data = (await response.json()) as {
        error?: string;
        summary?: { correct: number; total: number; reviewMistakes: number; sentence: string };
      };
      if (!response.ok || !data.summary) throw new Error(data.error || 'Could not save your progress.');
      setSummary({ ...data.summary, next: hasVocabulary ? 'vocabulary' : 'reading' });
    } catch (err) {
      setFinishError(err instanceof Error ? err.message : 'Could not save your progress.');
    } finally {
      setBusy(false);
    }
  }

  function goToNextTask() {
    const anchor = document.getElementById(next.href.replace('#', ''));
    anchor?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section
      id="grammar-practice"
      className="space-y-4 rounded-xl border border-stone-200 p-5"
      aria-label="Grammar practice"
    >
      <h2 className="text-xl font-semibold">Grammar practice</h2>
      <ProgressBar current={current.number} total={steps.length} title={current.title} />
      <p className="text-sm text-stone-600">{current.instruction}</p>
      {current.title === 'See it' && (
        <p className="whitespace-pre-line rounded-xl bg-indigo-50 p-4 text-sm leading-7">{grammar.notice}</p>
      )}
      {!signedIn && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm">Sign in to check and save your answers.</p>
      )}
      <div className="space-y-3">
        {shown.map((item: LearnerGrammarItem) => (
          <Item
            key={item.id}
            item={item}
            week={week}
            signedIn={signedIn}
            saved={progress?.answers[item.id]}
            onMarked={(id, correct) => setResults((prev) => ({ ...prev, [id]: correct }))}
          />
        ))}
      </div>
      <div className="flex justify-between gap-2">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm disabled:opacity-40"
        >
          Previous
        </button>
        {lastStep ? (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              disabled={!signedIn || busy || !canFinishRule(planned, results)}
              onClick={finish}
              className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Finish grammar'}
            </button>
            {!summary && finishHint(remaining) && (
              <span className="text-xs text-stone-600">{finishHint(remaining)}</span>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIndex((value) => Math.min(steps.length - 1, value + 1))}
            className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white"
          >
            Next
          </button>
        )}
      </div>
      {finishError && (
        <p role="alert" className="text-sm text-red-700">
          {finishError}
        </p>
      )}
      {summary && (
        <FinishSummary
          title="Grammar practice finished"
          summary={summary}
          nextLabel={next.label}
          nextHref={next.href}
          onNext={goToNextTask}
        />
      )}
    </section>
  );
}

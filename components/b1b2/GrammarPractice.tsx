'use client';

import { useMemo, useState } from 'react';
import type { LearnerGrammar, LearnerGrammarItem, LearnerGrammarStep } from '@/lib/curriculum/learner-grammar';
import { visibleItems } from '@/lib/curriculum/grammar-branch.mjs';

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
  onMarked,
}: {
  item: LearnerGrammarItem;
  week: number;
  signedIn: boolean;
  onMarked: (id: string, correct: boolean) => void;
}) {
  const [answer, setAnswer] = useState<string[]>(Array(Math.max(1, item.blankCount)).fill(''));
  const [marked, setMarked] = useState<Marked | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (item.needsAi) {
    return (
      <div className="space-y-2 rounded-xl bg-stone-50 p-4">
        <p className="font-medium">{item.prompt}</p>
        <p className="text-sm text-stone-600">
          Write your sentence in the speaking or writing box, where the app replies to your own words.
        </p>
      </div>
    );
  }

  const isChoice = item.options.length > 0;

  async function check() {
    setError('');
    setBusy(true);
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
              }}
              className="min-w-40 flex-1 rounded-lg border border-stone-300 bg-white p-2"
            />
          ))}
        </div>
      )}
      {item.needsAi ? null : (
        <button
          type="button"
          disabled={!signedIn || busy || answer.every((part) => !part.trim())}
          onClick={check}
          className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Check'}
        </button>
      )}
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
}: {
  grammar: LearnerGrammar;
  week: number;
  signedIn: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, boolean>>({});
  const steps = grammar.steps;
  const current: LearnerGrammarStep = steps[Math.min(index, steps.length - 1)];

  /**
   * The adaptive rules are applied silently and live in grammar-branch.mjs, so
   * the component and the unit tests cannot disagree about them.
   */
  const shown = useMemo(() => visibleItems(current, steps, results), [current, steps, results]);

  return (
    <section className="space-y-4 rounded-xl border border-stone-200 p-5" aria-label="Grammar practice">
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
          <Item key={item.id} item={item} week={week} signedIn={signedIn} onMarked={(id, correct) => setResults((prev) => ({ ...prev, [id]: correct }))} />
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
        <button
          type="button"
          disabled={index === steps.length - 1}
          onClick={() => setIndex((value) => Math.min(steps.length - 1, value + 1))}
          className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </section>
  );
}

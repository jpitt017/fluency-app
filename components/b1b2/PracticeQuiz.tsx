'use client';

import { useMemo, useState } from 'react';

export interface QuizItem {
  id: string;
  prompt: string;
  options: string[] | null;
  answer: string;
  explanation?: string | null;
}

/**
 * Multiple-choice quiz used by the practice block and by the comprehension
 * questions inside the input block. Answers are compared as text because the
 * content stores the correct option itself, not an index.
 */
export default function PracticeQuiz({
  items,
  onScoreChange,
  compact = false,
}: {
  items: QuizItem[];
  onScoreChange?: (correct: number, total: number) => void;
  compact?: boolean;
}) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const score = useMemo(() => {
    return items.reduce(
      (total, item) => (checked[item.id] && selected[item.id] === item.answer ? total + 1 : total),
      0,
    );
  }, [items, checked, selected]);

  if (!items.length) return null;

  function check(item: QuizItem) {
    if (!selected[item.id]) return;
    const nextChecked = { ...checked, [item.id]: true };
    setChecked(nextChecked);
    const correct = items.reduce(
      (total, entry) => (nextChecked[entry.id] && selected[entry.id] === entry.answer ? total + 1 : total),
      0,
    );
    onScoreChange?.(correct, items.length);
  }

  return (
    <ol className={compact ? 'mt-3 space-y-3' : 'mt-4 space-y-4'}>
      {items.map((item, index) => {
        const isChecked = Boolean(checked[item.id]);
        const isCorrect = isChecked && selected[item.id] === item.answer;
        return (
          <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">
              <span className="mr-2 text-xs font-bold text-indigo-700">{String(index + 1).padStart(2, '0')}</span>
              {item.prompt}
            </p>
            <div className="mt-3 grid gap-2">
              {(item.options ?? []).map((option) => {
                const chosen = selected[item.id] === option;
                const answerOption = isChecked && option === item.answer;
                const wrongChosen = isChecked && chosen && option !== item.answer;
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={isChecked}
                    onClick={() => setSelected((current) => ({ ...current, [item.id]: option }))}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                      answerOption
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                        : wrongChosen
                          ? 'border-rose-400 bg-rose-50 text-rose-900'
                          : chosen
                            ? 'border-indigo-400 bg-indigo-50 text-indigo-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40'
                    } ${isChecked ? 'cursor-default' : ''}`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className={`text-xs font-semibold ${isChecked ? (isCorrect ? 'text-emerald-700' : 'text-rose-700') : 'text-slate-500'}`}>
                {isChecked ? (isCorrect ? 'Correct' : `Answer: ${item.answer}`) : 'Choose one option'}
              </span>
              {!isChecked && (
                <button
                  type="button"
                  onClick={() => check(item)}
                  disabled={!selected[item.id]}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Check answer
                </button>
              )}
            </div>
            {isChecked && item.explanation && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs leading-5 text-slate-600">{item.explanation}</p>}
          </li>
        );
      })}
      <li className="text-right text-xs font-semibold text-slate-500">
        Score {score} / {items.length}
      </li>
    </ol>
  );
}

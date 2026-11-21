'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export interface QuizItem {
  id: string;
  kind?: string;
  prompt: string;
  options: string[] | null;
  answer: string;
  explanation?: string | null;
}

function renderPromptWithBlank(prompt: string, fillText?: string) {
  if (!prompt.includes('___')) return prompt;
  const parts = prompt.split('___');
  return parts.map((part, idx) => (
    <span key={idx}>
      {part}
      {idx < parts.length - 1 && (
        <span className="mx-1 inline-block min-w-[5rem] border-b-2 border-indigo-400 bg-indigo-50/70 px-2 py-0.5 text-center font-semibold text-indigo-900 rounded">
          {fillText?.trim() ? fillText : '______'}
        </span>
      )}
    </span>
  ));
}

function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '');
}

function supportsRecallInput(item: QuizItem): boolean {
  return item.prompt.includes('___') || item.answer.split(/\s+/).length <= 4;
}

export default function PracticeQuiz({
  items,
  onScoreChange,
  compact = false,
  lessonId,
  signedIn = false,
  grammarPoint,
}: {
  items: QuizItem[];
  onScoreChange?: (correct: number, total: number) => void;
  compact?: boolean;
  lessonId?: string;
  signedIn?: boolean;
  grammarPoint?: string | null;
}) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const [recallMode, setRecallMode] = useState(false);
  const [revealedHints, setRevealedHints] = useState<Record<string, boolean>>({});

  const [sentenceDraft, setSentenceDraft] = useState('');
  const [sentenceChecking, setSentenceChecking] = useState(false);
  const [sentenceFeedback, setSentenceFeedback] = useState<{
    corrected: string;
    feedback: string;
    score: number;
  } | null>(null);
  const [sentenceError, setSentenceError] = useState('');

  const supabase = useMemo(() => (typeof window !== 'undefined' ? createClient() : null), []);

  const score = useMemo(() => {
    return items.reduce((total, item) => {
      if (!checked[item.id]) return total;
      const isMatch = normalizeAnswer(selected[item.id] ?? '') === normalizeAnswer(item.answer);
      return isMatch ? total + 1 : total;
    }, 0);
  }, [items, checked, selected]);

  if (!items.length) return null;

  async function check(item: QuizItem) {
    const response = selected[item.id];
    if (!response || !response.trim()) return;

    const isCorrect = normalizeAnswer(response) === normalizeAnswer(item.answer);
    const nextChecked = { ...checked, [item.id]: true };
    setChecked(nextChecked);
    setAttempts((prev) => ({ ...prev, [item.id]: (prev[item.id] ?? 0) + 1 }));

    const correct = items.reduce((total, entry) => {
      if (!nextChecked[entry.id]) return total;
      const val = entry.id === item.id ? response : selected[entry.id] ?? '';
      return normalizeAnswer(val) === normalizeAnswer(entry.answer) ? total + 1 : total;
    }, 0);
    onScoreChange?.(correct, items.length);

    if (signedIn && lessonId && supabase && !item.id.includes('-q')) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('practice_attempts').insert({
            user_id: user.id,
            item_id: item.id,
            lesson_id: lessonId,
            is_correct: isCorrect,
            response: response.trim(),
          });
        }
      } catch {
        /* Non-blocking tracking */
      }
    }
  }

  function retry(itemId: string) {
    setChecked((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setSelected((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }

  async function checkCustomSentence() {
    if (!sentenceDraft.trim()) return;
    setSentenceChecking(true);
    setSentenceError('');
    setSentenceFeedback(null);
    try {
      const res = await fetch('/api/writing/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sentenceDraft.trim(),
          prompt: `Produce 1-2 natural B1 -> B2 sentences using: ${grammarPoint || 'the lesson target structure'}.`,
        }),
      });
      const data = (await res.json()) as {
        corrected?: string;
        feedback?: string;
        score?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Could not evaluate sentence.');
      setSentenceFeedback({
        corrected: data.corrected ?? sentenceDraft,
        feedback: data.feedback ?? '',
        score: data.score ?? 80,
      });
    } catch (caught) {
      setSentenceError(caught instanceof Error ? caught.message : 'Could not evaluate sentence.');
    } finally {
      setSentenceChecking(false);
    }
  }

  const hasRecallItems = !compact && items.some(supportsRecallInput);

  return (
    <div className={compact ? 'mt-3 space-y-3' : 'mt-4 space-y-4'}>
      {hasRecallItems && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5">
          <p className="text-xs text-stone-600">
            {recallMode
              ? 'Active Recall: type the missing phrase from memory before checking.'
              : 'Recognition mode — switch to Active Recall to type phrases without hints.'}
          </p>
          <div className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setRecallMode(false)}
              className={`rounded-md px-2.5 py-1 ${!recallMode ? 'bg-stone-900 text-white' : 'text-stone-600'}`}
            >
              Multiple choice
            </button>
            <button
              type="button"
              onClick={() => setRecallMode(true)}
              className={`rounded-md px-2.5 py-1 ${recallMode ? 'bg-indigo-700 text-white' : 'text-stone-600'}`}
            >
              Active recall (type it)
            </button>
          </div>
        </div>
      )}

      <ol className="space-y-3.5">
        {items.map((item, index) => {
          const isChecked = Boolean(checked[item.id]);
          const userAnswer = selected[item.id] ?? '';
          const isCorrect = isChecked && normalizeAnswer(userAnswer) === normalizeAnswer(item.answer);
          const useTyping = recallMode && supportsRecallInput(item) && !revealedHints[item.id];
          const attemptCount = attempts[item.id] ?? 0;

          return (
            <li key={item.id} className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold leading-6 text-stone-900">
                  <span className="mr-2 text-xs font-bold text-indigo-700">{String(index + 1).padStart(2, '0')}</span>
                  {renderPromptWithBlank(item.prompt, userAnswer)}
                </p>
                {item.kind === 'gap_fill' && (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200/80">
                    Gap-fill
                  </span>
                )}
              </div>

              {useTyping ? (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      disabled={isChecked}
                      value={userAnswer}
                      onChange={(e) => setSelected((curr) => ({ ...curr, [item.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isChecked && userAnswer.trim()) {
                          e.preventDefault();
                          void check(item);
                        }
                      }}
                      placeholder="Type the exact word or phrase…"
                      className="flex-1 rounded-lg border border-stone-300 bg-stone-50/60 px-3 py-2 text-sm text-stone-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setRevealedHints((prev) => ({ ...prev, [item.id]: true }))}
                      className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                    >
                      Show options
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid gap-2">
                  {(item.options ?? []).map((option) => {
                    const chosen = userAnswer === option;
                    const answerOption = isChecked && isCorrect && option === item.answer;
                    const revealAfterRetry = isChecked && attemptCount >= 2 && option === item.answer;
                    const wrongChosen = isChecked && chosen && !isCorrect;
                    return (
                      <button
                        key={option}
                        type="button"
                        disabled={isChecked}
                        onClick={() => setSelected((current) => ({ ...current, [item.id]: option }))}
                        className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                          answerOption || revealAfterRetry
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                            : wrongChosen
                              ? 'border-rose-400 bg-rose-50 text-rose-900'
                              : chosen
                                ? 'border-indigo-500 bg-indigo-50 text-indigo-950'
                                : 'border-stone-200 bg-white text-stone-700 hover:border-indigo-300 hover:bg-indigo-50/40'
                        } ${isChecked ? 'cursor-default' : ''}`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
                <span
                  className={`text-xs font-semibold ${
                    isChecked ? (isCorrect ? 'text-emerald-700' : 'text-rose-700') : 'text-stone-500'
                  }`}
                >
                  {isChecked
                    ? isCorrect
                      ? 'Correct!'
                      : attemptCount >= 2
                        ? `Answer: ${item.answer}`
                        : 'Not quite — read the pattern note and try again'
                    : useTyping
                      ? 'Type your answer and press Check'
                      : 'Choose one option'}
                </span>

                <div className="flex items-center gap-2">
                  {isChecked && !isCorrect && (
                    <button
                      type="button"
                      onClick={() => retry(item.id)}
                      className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 transition hover:bg-indigo-100"
                    >
                      Try again
                    </button>
                  )}
                  {!isChecked && (
                    <button
                      type="button"
                      onClick={() => check(item)}
                      disabled={!userAnswer.trim()}
                      className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                    >
                      Check answer
                    </button>
                  )}
                </div>
              </div>

              {isChecked && item.explanation && (
                <p
                  className={`mt-2 rounded-lg p-2.5 text-xs leading-5 ${
                    isCorrect ? 'bg-emerald-50/70 text-emerald-900' : 'bg-amber-50/80 text-stone-700'
                  }`}
                >
                  <strong>Why:</strong> {item.explanation}
                </p>
              )}
            </li>
          );
        })}

        <li className="text-right text-xs font-semibold text-stone-500">
          Score {score} / {items.length}
        </li>
      </ol>

      {!compact && signedIn && lessonId && (
        <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-indigo-900">
              Make it active · Produce your own sentence
            </h3>
            {grammarPoint && <span className="text-[11px] font-medium text-indigo-700">{grammarPoint}</span>}
          </div>
          <p className="mt-1 text-xs text-stone-600">
            Write 1–2 original sentences using today&apos;s structure to lock it into active memory.
          </p>
          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={sentenceDraft}
              onChange={(e) => setSentenceDraft(e.target.value)}
              placeholder="Write your own example sentence here…"
              className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="button"
              disabled={sentenceChecking || !sentenceDraft.trim()}
              onClick={checkCustomSentence}
              className="shrink-0 rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800 disabled:bg-stone-300"
            >
              {sentenceChecking ? 'Checking…' : 'Check my sentence'}
            </button>
          </div>
          {sentenceError && <p className="mt-2 text-xs text-rose-700">{sentenceError}</p>}
          {sentenceFeedback && (
            <div className="mt-3 space-y-1.5 rounded-lg bg-white p-3 text-xs ring-1 ring-indigo-200">
              <p className="font-semibold text-indigo-900">
                Natural phrasing ({sentenceFeedback.score}/100):{' '}
                <span className="font-normal text-stone-800">{sentenceFeedback.corrected}</span>
              </p>
              {sentenceFeedback.feedback && <p className="text-stone-600">{sentenceFeedback.feedback}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

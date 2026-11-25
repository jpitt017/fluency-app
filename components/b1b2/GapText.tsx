'use client';

import { useEffect, useRef, useState } from 'react';
import { parseGapText, gapsCoverItems } from '@/lib/curriculum/vocabulary-gap-text.mjs';
import { SavedTick } from './PracticeFeedback';

type GapItem = { id: string; gap: number };
type Mark = { correct: boolean; feedback: string };
type Saved = { answer: string; correct: boolean; reason: string | null };

const CHECK_ERROR = 'We could not check your answer. Please try again.';

/**
 * Step 3: the gaps live inside the text.
 *
 * Each gap is a button in the paragraph. It opens the word box next to the gap
 * on a wide screen, or as a small fixed panel at the bottom of a phone. A word
 * already used in another gap is greyed out and cannot be picked again;
 * "Remove word" frees it. One Check marks every gap through the same server
 * route the single-question steps use, and the reason lands beside each gap.
 *
 * Keyboard and screen reader: the gap buttons sit in reading order inside the
 * paragraph; opening one moves focus into the box, Escape closes it and returns
 * focus to the gap; each marked gap is described by its result via
 * aria-describedby, and one polite status line announces the score.
 */
export default function GapText({
  week,
  text,
  signedIn,
  saved,
  onAnswered,
  onChanged,
}: {
  week: number;
  text: { instruction: string; body: string; wordBox: string[]; items: GapItem[] };
  signedIn: boolean;
  /** The saved answers, so a reload shows the words already placed and marked. */
  saved?: Record<string, Saved>;
  onAnswered: (id: string, correct: boolean) => void;
  /** An edited answer needs checking again before finishing the practice. */
  onChanged: (id: string) => void;
}) {
  const segments = parseGapText(text.body, text.items);
  const complete = gapsCoverItems(segments, text.items);

  const [choices, setChoices] = useState<Record<number, string>>(() => {
    const restored: Record<number, string> = {};
    for (const item of text.items) {
      const answer = saved?.[item.id]?.answer;
      if (answer) restored[item.gap] = answer;
    }
    return restored;
  });
  const [marks, setMarks] = useState<Record<number, Mark>>(() => {
    const restored: Record<number, Mark> = {};
    for (const item of text.items) {
      const entry = saved?.[item.id];
      if (entry?.answer) {
        restored[item.gap] = {
          correct: entry.correct,
          feedback: entry.reason ?? (entry.correct ? 'That is right.' : 'Not quite. Try again.'),
        };
      }
    }
    return restored;
  });
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [openGap, setOpenGap] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [checked, setChecked] = useState(false);

  const gapButtons = useRef(new Map<number, HTMLButtonElement | null>());
  const boxRef = useRef<HTMLSpanElement | null>(null);

  // Opening the box moves focus to the chosen word, or the first free one.
  useEffect(() => {
    if (openGap === null) return;
    const box = boxRef.current;
    if (!box) return;
    const target =
      box.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ??
      box.querySelector<HTMLButtonElement>('button[data-word]:not(:disabled)');
    target?.focus();
  }, [openGap]);

  // A click outside the box and its gap closes it, without stealing focus.
  useEffect(() => {
    if (openGap === null) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (boxRef.current?.contains(target)) return;
      if (gapButtons.current.get(openGap as number)?.contains(target)) return;
      setOpenGap(null);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [openGap]);

  if (!complete) return null; // the caller keeps the plain version for a mismatched bank

  const usedInGap = (word: string, except: number) => {
    for (const item of text.items) {
      if (item.gap !== except && choices[item.gap] === word) return item.gap;
    }
    return null;
  };
  const allFilled = text.items.every((item) => Boolean(choices[item.gap]));

  function closeBox(refocus: boolean, gap: number | null = openGap) {
    setOpenGap(null);
    if (refocus && gap !== null) gapButtons.current.get(gap)?.focus();
  }

  function clearMark(gap: number) {
    const item = text.items.find((entry) => entry.gap === gap);
    if (item) onChanged(item.id);
    setMarks((prev) => {
      const next = { ...prev };
      delete next[gap];
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[gap];
      return next;
    });
    setSavedTick(false);
    setChecked(false);
  }

  function choose(word: string) {
    if (openGap === null) return;
    const gap = openGap;
    if (choices[gap] !== word) {
      setChoices((prev) => ({ ...prev, [gap]: word }));
      clearMark(gap);
    }
    closeBox(true, gap);
  }

  function removeWord() {
    if (openGap === null) return;
    const gap = openGap;
    setChoices((prev) => {
      const next = { ...prev };
      delete next[gap];
      return next;
    });
    clearMark(gap);
    closeBox(true, gap);
  }

  async function checkAll() {
    // Freeze the choices until the server has marked them. Otherwise a result
    // for the old choice could appear beside a word selected during the request.
    setOpenGap(null);
    setBusy(true);
    setSavedTick(false);
    setErrors({});
    // One request per gap through the same marking route as every other step:
    // the answer bank stays on the server and each attempt is saved there.
    const results = await Promise.all(
      text.items.map(async (item) => {
        try {
          const response = await fetch('/api/week/vocabulary/mark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ week, id: item.id, answer: choices[item.gap] }),
          });
          const data = (await response.json().catch(() => null)) as
            | { correct: boolean; feedback: string; error?: string }
            | null;
          if (!response.ok || !data) {
            console.error('[vocabulary] gap check failed:', item.id, data?.error ?? response.status);
            return { item, error: data?.error || CHECK_ERROR };
          }
          return { item, mark: { correct: data.correct, feedback: data.feedback } };
        } catch (err) {
          console.error('[vocabulary] gap check failed:', item.id, err);
          return { item, error: CHECK_ERROR };
        }
      }),
    );
    const nextMarks: Record<number, Mark> = {};
    const nextErrors: Record<number, string> = {};
    let failures = 0;
    for (const result of results) {
      if (result.mark) {
        nextMarks[result.item.gap] = result.mark;
        onAnswered(result.item.id, result.mark.correct);
      } else {
        failures += 1;
        nextErrors[result.item.gap] = result.error as string;
      }
    }
    setMarks(nextMarks);
    setErrors(nextErrors);
    setSavedTick(failures === 0);
    setChecked(failures === 0);
    setBusy(false);
  }

  const rightCount = text.items.filter((item) => marks[item.gap]?.correct).length;
  const boxId = 'gap-word-box';

  return (
    <div className="space-y-3" data-testid="gap-text">
      <p>{text.instruction}</p>
      <p className="leading-9" data-testid="gap-text-body">
        {segments.map((segment, index) => {
          if (segment.type === 'text') return <span key={index}>{segment.text}</span>;
          const gap = segment.gap;
          const chosen = choices[gap];
          const mark = marks[gap];
          const error = errors[gap];
          const resultId = `gap-result-${gap}`;
          const open = openGap === gap;
          return (
            <span key={index}>
              <span className="relative inline-block align-baseline">
                <button
                  type="button"
                  ref={(element) => {
                    gapButtons.current.set(gap, element);
                  }}
                  data-testid={`gap-button-${gap}`}
                  disabled={busy}
                  aria-expanded={open}
                  aria-controls={open ? boxId : undefined}
                  aria-describedby={mark || error ? resultId : undefined}
                  aria-label={`Gap ${gap}${chosen ? `: ${chosen}. Change word` : ': choose a word'}`}
                  onClick={() => (open ? closeBox(true, gap) : setOpenGap(gap))}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && open) closeBox(true, gap);
                  }}
                  className={`mx-0.5 rounded-lg border px-2 py-0.5 text-sm font-semibold underline decoration-dotted underline-offset-2 ${
                    mark
                      ? mark.correct
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                        : 'border-amber-300 bg-amber-50 text-amber-900'
                      : chosen
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                        : 'border-stone-300 bg-stone-50 text-stone-600'
                  }`}
                >
                  {chosen ?? `(${gap}) choose word`}
                </button>
                {open && (
                  <span
                    ref={boxRef}
                    id={boxId}
                    role="dialog"
                    aria-label={`Word box for gap ${gap}`}
                    data-testid="gap-word-box"
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.stopPropagation();
                        closeBox(true, gap);
                      }
                    }}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenGap(null);
                    }}
                    className="fixed inset-x-3 bottom-3 z-50 block max-h-[45vh] overflow-y-auto rounded-xl border border-stone-300 bg-white p-3 text-left shadow-lg sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:z-20 sm:mt-1 sm:max-h-72 sm:w-72"
                  >
                    <span className="mb-2 block text-xs font-semibold text-stone-600">
                      Choose a word for gap {gap}
                    </span>
                    <span className="block space-y-1">
                      {text.wordBox.map((word) => {
                        const usedIn = usedInGap(word, gap);
                        const selected = chosen === word;
                        return (
                          <button
                            key={word}
                            type="button"
                            data-testid="gap-word-option"
                            data-word={word}
                            disabled={usedIn !== null}
                            aria-pressed={selected}
                            onClick={() => choose(word)}
                            className={`block w-full rounded-lg border px-3 py-2 text-left text-sm font-medium ${
                              usedIn !== null
                                ? 'cursor-not-allowed border-stone-200 bg-stone-50 text-stone-400'
                                : selected
                                  ? 'border-indigo-400 bg-indigo-50 text-indigo-900'
                                  : 'border-stone-200 bg-white text-stone-800 hover:bg-stone-100'
                            }`}
                          >
                            {word}
                            {usedIn !== null && (
                              <span className="text-xs font-normal"> · used in gap {usedIn}</span>
                            )}
                          </button>
                        );
                      })}
                    </span>
                    {chosen && (
                      <button
                        type="button"
                        data-testid="gap-remove-word"
                        onClick={removeWord}
                        className="mt-2 text-sm font-semibold text-indigo-700 underline"
                      >
                        Remove word
                      </button>
                    )}
                  </span>
                )}
              </span>
              {(mark || error) && (
                <span
                  id={resultId}
                  data-testid={`gap-result-${gap}`}
                  className={`ml-1 text-sm ${error ? 'text-red-700' : mark?.correct ? 'text-emerald-800' : 'text-amber-900'}`}
                >
                  {error ?? (
                    <>
                      <strong>{mark?.correct ? 'Correct! ' : 'Not quite. '}</strong>
                      {mark?.feedback}
                    </>
                  )}
                </span>
              )}
            </span>
          );
        })}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="gap-check"
          disabled={!signedIn || busy || !allFilled}
          onClick={checkAll}
          className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Check'}
        </button>
        <SavedTick saved={savedTick} saving={busy} />
        {signedIn && !allFilled && (
          <span className="text-xs text-stone-600">Choose a word for every gap to check.</span>
        )}
      </div>
      {checked && (
        <p role="status" data-testid="gap-summary" className="text-sm font-medium text-stone-800">
          You got {rightCount} of {text.items.length} right.
          {rightCount < text.items.length && ' Change a word and check again.'}
        </p>
      )}
    </div>
  );
}

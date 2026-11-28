'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import type { LearnerGrammar, LearnerGrammarItem, LearnerGrammarStep } from '@/lib/curriculum/learner-grammar';
import { visibleItems } from '@/lib/curriculum/grammar-branch.mjs';
import {
  createGrammarPositionStore,
  grammarPositionItem,
  grammarPositionKey,
  parseGrammarPosition,
} from '@/lib/curriculum/grammar-practice-position.mjs';
import {
  canFinish as canFinishRule,
  finishHint,
  nextTaskAfter,
  resumeStep,
} from '@/lib/curriculum/week-practice.mjs';
import type { PracticeProgress, SavedAnswer } from '@/lib/curriculum/week-practice-progress';
import type { SentencePractice, SentencePracticeByItem } from '@/lib/curriculum/week-sentence-practice';
import SentenceBox from './SentenceBox';
import PersonalSentenceBox from './PersonalSentenceBox';
import PracticeItemPager from './PracticeItemPager';
import { FinishSummary, SavedTick, type PracticeSummary } from './PracticeFeedback';
import { focusNextTask, usePracticeNavigation } from './usePracticeNavigation';
import { ACTION_BUTTON_CLASS } from '@/lib/curriculum/week-tasks.mjs';
import { usePendingChecks } from './usePendingChecks';

type Marked = { correct: boolean; nearly?: boolean; reason: string | null };

const NO_ANSWERS: Record<string, SavedAnswer> = {};

function remembersItems(title: LearnerGrammarStep['title']): title is 'Practise' | 'Fix it' {
  return title === 'Practise' || title === 'Fix it';
}

function ProgressBar({ current, total, title, headingRef }: {
  current: number; total: number; title: string; headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const percent = Math.round((current / total) * 100);
  return (
    <div className="space-y-1">
      <h3 ref={headingRef} tabIndex={-1} data-practice-step-heading className="text-sm font-medium text-stone-700">
        Step {current} of {total}: {title}
      </h3>
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
  personal,
  largeOptions = false,
  finishing = false,
  onMarked,
  onCheckingChange,
}: {
  item: LearnerGrammarItem;
  week: number;
  signedIn: boolean;
  /** The saved answer from the server, when there is one. */
  saved?: Marked & { answer: string };
  personal?: SentencePractice;
  largeOptions?: boolean;
  finishing?: boolean;
  onMarked: (id: string, saved: SavedAnswer) => void;
  onCheckingChange?: (id: string, checking: boolean) => void;
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

  // Personal Use it writing has its own guidance and two saved versions.
  // Fix it rewrites keep their existing sentence box and marking.
  if (item.step === 'Use it' && item.useItSupport) {
    return <PersonalSentenceBox
      week={week} id={item.id} prompt={item.prompt} kind="grammar-use-it" guidance={item.useItSupport}
      signedIn={signedIn} initial={personal} initialAnswer={saved?.answer}
      onChecked={(onTarget, answer) => onMarked(item.id, { answer, correct: onTarget, reason: null })}
    />;
  }
  if (item.needsAi) {
    return (
      <SentenceBox
        week={week}
        id={item.id}
        prompt={item.prompt}
        signedIn={signedIn}
        rows={item.step === 'Use it' ? 3 : 2}
        initialAnswer={saved?.answer}
        freezeWhileChecking={largeOptions}
        onChecked={(onTarget, answer) => {
          setSavedAt(true);
          onMarked(item.id, { answer, correct: onTarget, reason: null });
        }}
      />
    );
  }

  const isChoice = item.options.length > 0;

  async function check() {
    setError('');
    setBusy(true);
    onCheckingChange?.(item.id, true);
    setSavedAt(false);
    try {
      const value = item.blankCount > 1 && !isChoice ? answer : answer[0];
      const response = await fetch('/api/week/grammar/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, id: item.id, answer: value }),
      });
      const data = (await response.json()) as Marked & { error?: string };
      if (!response.ok) {
        console.error('[grammar] check failed:', data.error ?? response.status);
        setError(data.error || 'We could not check your answer. Please try again.');
        return;
      }
      setMarked(data);
      setSavedAt(true);
      onMarked(item.id, {
        answer: Array.isArray(value) ? value.join(' ... ') : value,
        correct: data.correct,
        reason: data.reason,
      });
    } catch (err) {
      console.error('[grammar] check failed:', err);
      setError('We could not check your answer. Please try again.');
    } finally {
      setBusy(false);
      onCheckingChange?.(item.id, false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl bg-stone-50 p-4">
      <p id={`${item.id}-prompt`} className="font-medium">{item.prompt}</p>
      {isChoice ? (
        <div
          role={largeOptions ? 'radiogroup' : undefined}
          aria-labelledby={largeOptions ? `${item.id}-prompt` : undefined}
          className={largeOptions ? 'space-y-2' : 'space-y-1'}
        >
          {item.options.map((option) => (
            <label key={option} className={largeOptions
              ? `flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-base focus-within:ring-2 focus-within:ring-indigo-600 ${answer[0] === option ? 'border-indigo-600 bg-indigo-50' : 'border-stone-300 bg-white'}`
              : 'flex items-center gap-2 text-sm'}>
              <input
                type="radio"
                name={`${item.id}-options`}
                checked={answer[0] === option}
                disabled={largeOptions && busy}
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
              aria-describedby={largeOptions ? `${item.id}-prompt` : undefined}
              disabled={largeOptions && busy}
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
          disabled={!signedIn || busy || finishing || answer.every((part) => !part.trim())}
          onClick={check}
          className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Check'}
        </button>
        <SavedTick saved={savedAt} error={error || undefined} saving={busy} />
      </div>
      {marked && (
        <div role="status" className={marked.correct ? 'text-emerald-800' : 'text-amber-900'}>
          <strong>{marked.correct ? 'Correct! ' : marked.nearly ? '' : 'Not quite. '}</strong>
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
  userId,
  progress,
  sentencePractice,
  hasVocabulary,
}: {
  grammar: LearnerGrammar;
  week: number;
  signedIn: boolean;
  /** Used only to keep browser navigation positions separate between learners. */
  userId: string | null;
  /** What the server has saved for this learner, so a reload restores their marks. */
  progress?: PracticeProgress | null;
  sentencePractice?: SentencePracticeByItem;
  hasVocabulary?: boolean;
}) {
  const steps = grammar.steps;
  const restored = useMemo<Record<string, boolean>>(() => {
    const results: Record<string, boolean> = {};
    for (const [id, saved] of Object.entries(progress?.answers ?? {})) results[id] = saved.correct;
    return results;
  }, [progress]);
  // Without a browser position (first visit, another device, or blocked
  // storage), retain the server's first-unanswered-step fallback.
  const initialAnswers = progress?.answers ?? NO_ANSWERS;
  const fallbackIndex = Math.min(progress?.step ?? resumeStep(steps, restored), Math.max(0, steps.length - 1));
  const positionStore = useMemo(() => createGrammarPositionStore(grammarPositionKey(week, userId)), [week, userId]);
  const position = parseGrammarPosition(useSyncExternalStore(
    positionStore.subscribe, positionStore.getSnapshot, positionStore.getServerSnapshot,
  ));
  const rememberedIndex = position ? steps.findIndex((step) => step.title === position.step) : -1;
  const index = rememberedIndex >= 0 ? rememberedIndex : fallbackIndex;
  const [results, setResults] = useState<Record<string, boolean>>(restored);
  // Preserve checked answers when a learner goes back to an earlier step.
  const [savedAnswers, setSavedAnswers] = useState<Record<string, SavedAnswer>>(initialAnswers);
  const [summary, setSummary] = useState(progress?.summary ?? null);
  const { sectionRef, stepHeadingRef, focusStep } = usePracticeNavigation();
  const examplesRef = useRef<HTMLParagraphElement>(null);
  const { checking, setChecking } = usePendingChecks();
  const [busy, setBusy] = useState(false);
  const [finishError, setFinishError] = useState('');
  const current: LearnerGrammarStep = steps[Math.min(index, steps.length - 1)];

  // If saved answers initially open a paged step, record the visible item even
  // before the learner moves. Otherwise checking that item and reloading would
  // advance to the next unanswered one instead of restoring the position.
  // Read the store again inside the effect: hydration may just have discovered
  // a browser position that was not available to the server render.
  useEffect(() => {
    const initialStep = steps[fallbackIndex];
    if (!initialStep || !remembersItems(initialStep.title)) return;
    const existing = parseGrammarPosition(positionStore.getSnapshot());
    if (existing && steps.some((step) => step.title === existing.step)) return;
    const shown = visibleItems(initialStep, steps, restored) as LearnerGrammarItem[];
    const itemId = grammarPositionItem(initialStep.items, shown, initialAnswers, undefined);
    if (!itemId) return;
    positionStore.update((latest) => {
      if (latest && steps.some((step) => step.title === latest.step)) return latest;
      return { step: initialStep.title, items: { [initialStep.title]: itemId } };
    });
  }, [fallbackIndex, initialAnswers, positionStore, restored, steps]);

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
        summary?: PracticeSummary;
      };
      if (!response.ok || !data.summary) {
        console.error('[grammar] finish failed:', data.error ?? response.status);
        setFinishError(data.error || 'We could not save your progress. Please try again.');
        return;
      }
      setSummary({ ...data.summary, next: hasVocabulary ? 'vocabulary' : 'reading' });
    } catch (err) {
      console.error('[grammar] finish failed:', err);
      setFinishError('We could not save your progress. Please try again.');
    } finally {
      setBusy(false);
      focusStep();
    }
  }

  function goToNextTask() {
    focusNextTask(next.href.replace('#', ''));
  }

  function changeStep(nextIndex: number, target?: RefObject<HTMLElement | null>) {
    const nextStep = steps[Math.max(0, Math.min(steps.length - 1, nextIndex))];
    if (!nextStep) return;
    positionStore.update((previous) => {
      const items = { ...previous?.items };
      if (remembersItems(nextStep.title)) {
        const shown = visibleItems(nextStep, steps, results) as LearnerGrammarItem[];
        const itemId = grammarPositionItem(nextStep.items, shown, initialAnswers, items[nextStep.title]);
        if (itemId) items[nextStep.title] = itemId;
      }
      return { step: nextStep.title, items };
    });
    focusStep(target);
  }

  return (
    <section ref={(node) => { sectionRef.current = node?.closest<HTMLElement>('section[id]') ?? node; }} className="space-y-4">
      <ProgressBar current={current.number} total={steps.length} title={current.title} headingRef={stepHeadingRef} />
      <p className="text-sm text-stone-600">{current.instruction}</p>
      {finishError && <p role="alert" className="text-sm text-red-700">{finishError}</p>}
      {summary && (
        <FinishSummary
          title="Grammar practice finished"
          skill="grammar"
          summary={summary}
          nextLabel={next.label}
          nextHref={next.href}
          onRevisit={() => changeStep(0, examplesRef)}
          onNext={goToNextTask}
        />
      )}
      {current.title === 'See it' && (
        <p ref={examplesRef} id="grammar-examples" tabIndex={-1} className="scroll-mt-20 whitespace-pre-line rounded-xl bg-indigo-50 p-4 text-sm leading-7">{grammar.notice}</p>
      )}
      {current.title === 'Use it' && grammar.useItModel && (
        <div className="rounded-xl bg-indigo-50 p-4 text-sm leading-7">
          <p className="font-semibold">An example by an imaginary learner</p>
          <p>{grammar.useItModel}</p>
        </div>
      )}
      {!signedIn && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm">Sign in to check and save your answers.</p>
      )}
      {steps.map((step, stepIndex) => {
        // The same adaptive rules and restored results decide which questions
        // exist before the pager counts or displays them.
        const shown = visibleItems(step, steps, results) as LearnerGrammarItem[];
        const paged = step.title === 'Practise' || step.title === 'Fix it' || step.title === 'Remember';
        const pages = (paged ? step.items : shown).map((item) => ({
          id: item.id,
          content: <Item
            key={item.id}
            item={item}
            week={week}
            signedIn={signedIn}
            saved={savedAnswers[item.id]}
            personal={sentencePractice?.[item.id]}
            largeOptions={paged}
            finishing={!item.needsAi && item.target !== 'Extra' && busy}
            onCheckingChange={!item.needsAi && item.target !== 'Extra' ? setChecking : undefined}
            onMarked={(id, saved) => {
              setResults((prev) => ({ ...prev, [id]: saved.correct }));
              setSavedAnswers((prev) => ({ ...prev, [id]: saved }));
              if (!item.needsAi && item.target !== 'Extra') {
                setSummary((prev) => prev ? { ...prev, scoreNeedsRefresh: true } : prev);
              }
            }}
          />,
        }));
        // Keep each step mounted while another is open: unchecked drafts,
        // pending checks and feedback survive step navigation as well.
        if (paged) {
          const rememberedTitle = remembersItems(step.title) ? step.title : null;
          const selectedItemId = rememberedTitle
            ? grammarPositionItem(step.items, shown, initialAnswers, position?.items[rememberedTitle])
            : undefined;
          return <div key={step.number} hidden={stepIndex !== index}>
            <PracticeItemPager
              label={`Grammar ${step.title}`}
              items={pages}
              visibleIds={new Set(shown.map((item) => item.id))}
              initiallyAnswered={initialAnswers}
              selectedItemId={selectedItemId}
              onSelectItem={rememberedTitle ? (id) => positionStore.update((previous) => ({
                step: rememberedTitle,
                items: { ...previous?.items, [rememberedTitle]: id },
              })) : undefined}
            />
          </div>;
        }
        return <div key={step.number} hidden={stepIndex !== index} className="space-y-3">{pages.map((page) => page.content)}</div>;
      })}
      <div className="flex justify-between gap-2">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => changeStep(index - 1)}
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm disabled:opacity-40"
        >
          Previous step
        </button>
        {lastStep ? (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              disabled={!signedIn || busy || checking || !canFinishRule(planned, results)}
              onClick={finish}
              className={ACTION_BUTTON_CLASS}
            >
              {busy ? 'Saving…' : 'Finish grammar'}
            </button>
            {checking ? (
              <span role="status" className="text-sm text-stone-600">Checking your answers. Please wait to finish.</span>
            ) : signedIn && !summary && finishHint(planned, results) && (
              <span className="text-sm text-stone-600">{finishHint(planned, results)}</span>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => changeStep(index + 1)}
            className={ACTION_BUTTON_CLASS}
          >
            Next step
          </button>
        )}
      </div>
    </section>
  );
}

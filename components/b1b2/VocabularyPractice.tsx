'use client';

import { useMemo, useRef, useState, type RefObject } from 'react';
import type { LearnerVocabularyCard } from '@/lib/curriculum/learner-vocabulary';
import type { VocabularyExercises } from '@/lib/curriculum/learner-vocabulary-exercises';
import {
  canFinish as canFinishRule,
  finishHint,
  nextTaskAfter,
} from '@/lib/curriculum/week-practice.mjs';
import type { PracticeProgress, SavedAnswer } from '@/lib/curriculum/week-practice-progress';
import { parseGapText, gapsCoverItems } from '@/lib/curriculum/vocabulary-gap-text.mjs';
import SentenceBox from './SentenceBox';
import PracticeItemPager from './PracticeItemPager';
import GapText from './GapText';
import { FinishSummary, SavedTick, type PracticeSummary } from './PracticeFeedback';
import { focusNextTask, usePracticeNavigation } from './usePracticeNavigation';
import { usePendingChecks } from './usePendingChecks';

type Question = { id: string; prompt: string; options?: string[] };
type Result = { correct: boolean; feedback: string };

/** One short B1 instruction per step: what to do now, nothing else. */
const STEP_INSTRUCTIONS = [
  'Read the new words for this week. Tap Listen to hear each one.',
  'Match each word to its meaning.',
  'Choose a word for each gap in the text.',
  'Choose the verb that fits the sentence.',
  'Choose the right form of the word.',
  'Type the word that matches the meaning.',
  'Write your own sentence with two of the new words.',
];

/** Four or five cards at a time: enough to scan, not enough to overwhelm. */
const CARDS_PER_PAGE = 4;

function StepProgress({ current, total, label, headingRef }: {
  current: number; total: number; label: string; headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const percent = Math.round((current / total) * 100);
  return (
    <div className="space-y-1">
      <h3 ref={headingRef} tabIndex={-1} data-practice-step-heading className="text-sm font-medium text-stone-700">
        Step {current} of {total}: {label}
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

function WordCard({
  card,
  note,
  onPlay,
  compact,
}: {
  card: LearnerVocabularyCard;
  note?: string;
  onPlay: () => void;
  compact?: boolean;
}) {
  return (
    <article className={compact ? 'rounded-lg border border-stone-200 p-3' : 'rounded-xl border border-stone-200 p-4'}>
      <h4 className={compact ? 'text-sm font-semibold' : 'font-semibold'}>
        {card.word}{' '}
        <span className="text-sm font-normal text-stone-500">{card.type}</span>
      </h4>
      <p className={compact ? 'text-sm' : ''}>{card.meaning}</p>
      <p className="mt-1 text-sm italic">{card.example}</p>
      {note && <p className="mt-2 text-sm text-amber-900">{note}</p>}
      <button type="button" onClick={onPlay} className="mt-2 text-sm text-indigo-700 underline">
        Listen{!card.audioUrl && ' · Temporary computer voice'}
      </button>
    </article>
  );
}

function PracticeQuestion({
  question,
  week,
  signedIn,
  saved,
  largeOptions = false,
  finishing = false,
  onAnswered,
  onCheckingChange,
}: {
  question: Question;
  week: number;
  signedIn: boolean;
  /** The saved answer and mark, so a reload shows what the learner already did. */
  saved?: SavedAnswer;
  largeOptions?: boolean;
  finishing?: boolean;
  onAnswered: (id: string, saved: SavedAnswer) => void;
  onCheckingChange: (id: string, checking: boolean) => void;
}) {
  const [answer, setAnswer] = useState(saved?.answer ?? '');
  // The saved reason is the authored feedback for this item; the sentence it
  // belongs to is the one they read when they checked, so the restore is whole.
  const [result, setResult] = useState<Result | null>(
    saved ? { correct: saved.correct, feedback: saved.reason ?? (saved.correct ? 'That is right.' : 'Not quite. Try again.') } : null,
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState(false);

  async function check() {
    setError('');
    setBusy(true);
    onCheckingChange(question.id, true);
    setSavedAt(false);
    try {
      const response = await fetch('/api/week/vocabulary/mark', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week, id: question.id, answer }) });
      const data = await response.json() as Result & { error?: string };
      if (!response.ok) {
        console.error('[vocabulary] check failed:', data.error ?? response.status);
        setError(data.error || 'We could not check your answer. Please try again.');
        return;
      }
      setResult(data);
      setSavedAt(true);
      onAnswered(question.id, { answer, correct: data.correct, reason: data.feedback });
    } catch (err) {
      console.error('[vocabulary] check failed:', err);
      setError('We could not check your answer. Please try again.');
    }
    finally { setBusy(false); onCheckingChange(question.id, false); }
  }

  return <div className="space-y-2 rounded-xl bg-stone-50 p-4">
    {largeOptions && question.options ? (
      <fieldset>
        <legend className="font-medium">{question.prompt}</legend>
        <div className="mt-2 space-y-2">
          {question.options.map((option) => (
            <label key={option} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-base focus-within:ring-2 focus-within:ring-indigo-600 ${answer === option ? 'border-indigo-600 bg-indigo-50' : 'border-stone-300 bg-white'}`}>
              <input type="radio" name={`${question.id}-options`} value={option} checked={answer === option} disabled={busy}
                onChange={() => { setAnswer(option); setResult(null); setSavedAt(false); }} />
              {option}
            </label>
          ))}
        </div>
      </fieldset>
    ) : <>
      <label htmlFor={question.id} className="block font-medium">{question.prompt}</label>
      {question.options ? <select id={question.id} value={answer} disabled={largeOptions && busy} onChange={e => { setAnswer(e.target.value); setResult(null); setSavedAt(false); }} className="w-full rounded-lg border border-stone-300 bg-white p-2"><option value="">Choose an answer</option>{question.options.map(option => <option key={option} value={option}>{option}</option>)}</select>
        : <input id={question.id} value={answer} disabled={largeOptions && busy} onChange={e => { setAnswer(e.target.value); setResult(null); setSavedAt(false); }} maxLength={500} className={`w-full rounded-lg border border-stone-300 bg-white p-2 ${largeOptions ? 'min-h-12' : ''}`} />}
    </>}
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={!signedIn || !answer.trim() || busy || finishing} onClick={check} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Checking…' : 'Check'}</button>
      <SavedTick saved={savedAt} error={error || undefined} saving={busy} />
    </div>
    {result && <div role="status" className={result.correct ? 'text-emerald-800' : 'text-amber-900'}><strong>{result.correct ? 'Correct! ' : 'Not quite. '}</strong>{result.feedback}</div>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </div>;
}

/**
 * Step 1, split by what the learner has to do with each word rather than by the
 * bank's internal `use` flag: the words they must produce come first and larger,
 * the words they only need to recognise come second and smaller.
 */
function WordGroups({
  cards,
  careful,
  onPlay,
  onPageChanged,
}: {
  cards: LearnerVocabularyCard[];
  careful: VocabularyExercises['careful'];
  onPlay: (card: LearnerVocabularyCard) => void;
  onPageChanged: () => void;
}) {
  const [page, setPage] = useState(0);

  // Pagination runs across both groups in order, so the learner always moves
  // forward through "words to use" before "words to understand". Built in one
  // memo from `cards` so the grouping and the pages cannot disagree.
  const pages = useMemo(() => {
    const groups = [
      { key: 'active', heading: 'Words to use', items: cards.filter((card) => card.use === 'P'), compact: false },
      { key: 'recognition', heading: 'Words to understand', items: cards.filter((card) => card.use !== 'P'), compact: true },
    ].filter((group) => group.items.length > 0);

    const flat = groups.flatMap((group) => group.items.map((card) => ({ group, card })));
    const chunks: { group: (typeof groups)[number]; card: LearnerVocabularyCard }[][] = [];
    for (let i = 0; i < flat.length; i += CARDS_PER_PAGE) chunks.push(flat.slice(i, i + CARDS_PER_PAGE));
    return chunks;
  }, [cards]);

  const current = pages[Math.min(page, pages.length - 1)] ?? [];
  const noteFor = (word: string) => careful.find((entry) => entry.target === word)?.note;

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-700">
        This week: {cards.length} new words. You&apos;ll practise them in the next steps.
      </p>
      {current.map(({ group, card }, index) => {
        const isFirstOfGroup = index === 0 || current[index - 1].group.key !== group.key;
        return (
          <div key={card.word} className="space-y-2">
            {isFirstOfGroup && (
              <h3
                className={
                  group.compact
                    ? 'pt-2 text-sm font-semibold text-stone-700'
                    : 'text-base font-semibold text-stone-900'
                }
              >
                {group.heading}
              </h3>
            )}
            <WordCard card={card} note={noteFor(card.word)} onPlay={() => onPlay(card)} compact={group.compact} />
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-stone-600">
          Page {Math.min(page, pages.length - 1) + 1} of {pages.length}
        </p>
        <button
          type="button"
          disabled={page >= pages.length - 1}
          onClick={() => {
            setPage((value) => Math.min(pages.length - 1, value + 1));
            onPageChanged();
          }}
          className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Next words →
        </button>
      </div>
    </div>
  );
}

export default function VocabularyPractice({
  cards,
  exercises,
  signedIn,
  progress,
}: {
  cards: LearnerVocabularyCard[];
  exercises: VocabularyExercises;
  signedIn: boolean;
  /** What the server has saved for this learner. */
  progress?: PracticeProgress | null;
}) {
  const steps = ['Words', 'Match', 'Complete the text', 'Choose the verb', 'Word forms', 'Type the word', 'Your sentences'];
  const groups: Question[][] = [[], exercises.match.words.map(q => ({ id: q.id, prompt: q.word, options: exercises.match.meanings })), exercises.text.items.map(q => ({ id: q.id, prompt: `Gap ${q.gap}`, options: exercises.text.wordBox })), exercises.chooseVerb.map(q => ({ id: q.id, prompt: q.question, options: q.options })), exercises.wordForms.map(q => ({ id: q.id, prompt: q.question, options: q.options })), exercises.typeTheWord.items.map(q => ({ id: q.id, prompt: `${q.meaning} (${q.hint})` }))];

  // The inline gap text needs every bank item to have its marker in the body.
  const gapTextReady = useMemo(
    () => gapsCoverItems(parseGapText(exercises.text.body, exercises.text.items), exercises.text.items),
    [exercises],
  );

  const [results, setResults] = useState<Record<string, boolean>>(() => {
    const restored: Record<string, boolean> = {};
    for (const [id, saved] of Object.entries(progress?.answers ?? {})) restored[id] = saved.correct;
    return restored;
  });
  const [savedAnswers, setSavedAnswers] = useState<Record<string, SavedAnswer>>(progress?.answers ?? {});
  const [summary, setSummary] = useState(progress?.summary ?? null);
  const { sectionRef, stepHeadingRef, focusStep } = usePracticeNavigation();
  const wordsRef = useRef<HTMLDivElement>(null);
  const { checking, setChecking } = usePendingChecks();
  const [busy, setBusy] = useState(false);
  const [finishError, setFinishError] = useState('');

  // Steps 1-5 are the questions, step 6 is the learner's own sentences.
  const planned = useMemo(
    () =>
      groups
        .flatMap((group, groupIndex) => group.map((question) => ({ id: question.id, index: groupIndex })))
        .concat(exercises.yourSentence.map((q) => ({ id: q.id, index: 6 })))
        .map(({ id, index }) => ({ id, optional: index === 6, counted: index > 0 && index < 6 })),
    // `groups` is rebuilt on every render; the ids are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exercises],
  );
  // The server restores the first unfinished step; a new learner sees the words.
  const [step, setStep] = useState(() =>
    Math.min(progress?.step ?? 0, steps.length - 1),
  );
  const lastStep = step === steps.length - 1;
  const next = nextTaskAfter('vocabulary');

  function play(card: LearnerVocabularyCard) {
    if (card.audioUrl) { void new Audio(card.audioUrl).play(); return; }
    if ('speechSynthesis' in window) { const speech = new SpeechSynthesisUtterance(card.word); speech.lang = 'en-GB'; window.speechSynthesis.cancel(); window.speechSynthesis.speak(speech); }
  }

  async function finish() {
    setBusy(true);
    setFinishError('');
    try {
      const response = await fetch('/api/week/practice/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week: exercises.week, skill: 'vocabulary' }),
      });
      const data = (await response.json()) as {
        error?: string;
        summary?: PracticeSummary;
      };
      if (!response.ok || !data.summary) {
        console.error('[vocabulary] finish failed:', data.error ?? response.status);
        setFinishError(data.error || 'We could not save your progress. Please try again.');
        return;
      }
      setSummary({ ...data.summary, next: 'reading' });
    } catch (err) {
      console.error('[vocabulary] finish failed:', err);
      setFinishError('We could not save your progress. Please try again.');
    } finally {
      setBusy(false);
      focusStep();
    }
  }

  function goToNextTask() {
    focusNextTask(next.href.replace('#', ''));
  }

  return <section ref={sectionRef} id="vocabulary-practice" className="space-y-4 rounded-xl border border-indigo-200 bg-white p-5 target:scroll-mt-20" aria-label="Vocabulary practice">
    <h2 tabIndex={-1} className="text-xl font-semibold">Vocabulary: {exercises.title}</h2>
    <StepProgress current={step + 1} total={steps.length} label={steps[step]} headingRef={stepHeadingRef} />
    <p className="text-sm text-stone-600">{STEP_INSTRUCTIONS[step]} This practice does not affect week unlocking.</p>
    {finishError && <p role="alert" className="text-sm text-red-700">{finishError}</p>}
    {summary && (
      <FinishSummary
        title="Vocabulary practice finished"
        skill="vocabulary"
        summary={summary}
        nextLabel={next.label}
        nextHref={next.href}
        onRevisit={() => { setStep(0); focusStep(wordsRef); }}
        onNext={goToNextTask}
      />
    )}
    {!signedIn && <p className="rounded-lg bg-amber-50 p-3 text-sm">Sign in to check and save your answers.</p>}
    {step === 0 && <div ref={wordsRef} id="vocabulary-words" role="group" aria-label="Words for this week" tabIndex={-1} className="scroll-mt-20">
      <WordGroups cards={cards} careful={exercises.careful} onPlay={play} onPageChanged={focusStep} />
    </div>}
    {step === 1 && <p className="text-sm text-stone-600">{exercises.match.instruction}</p>}
    {/* Step 3: the gaps sit inside the text. The plain version below only runs
        if a future bank edit leaves a gap without an item — the parse tests
        pin the current bank, so learners see the inline version. */}
    {gapTextReady && (
      // Keep the component mounted when changing steps so both unfinished
      // choices and checked feedback are still there when the learner returns.
      <div hidden={step !== 2}>
        <GapText
          week={exercises.week}
          text={exercises.text}
          signedIn={signedIn}
          saved={savedAnswers}
          finishing={busy}
          onCheckingChange={(checking) => setChecking('gap-text', checking)}
          onAnswered={(id, correct) => {
            setResults((prev) => ({ ...prev, [id]: correct }));
            setSummary((prev) => prev ? { ...prev, scoreNeedsRefresh: true } : prev);
          }}
          onChanged={(id) => setResults((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          })}
        />
      </div>
    )}
    {step === 2 && !gapTextReady && <><p>{exercises.text.instruction}</p><p className="leading-7">{exercises.text.body}</p><p className="text-sm">Word box: {exercises.text.wordBox.join(' · ')}</p></>}
    {step === 5 && <p className="text-sm text-stone-600">{exercises.typeTheWord.instruction}</p>}
    {[1, ...(!gapTextReady ? [2] : [])].map((stepIndex) => (
      <div key={steps[stepIndex]} hidden={step !== stepIndex} className="space-y-3">
        {groups[stepIndex].map((q) => (
          <PracticeQuestion key={q.id} question={q} week={exercises.week} signedIn={signedIn}
            saved={savedAnswers[q.id]} finishing={busy} onCheckingChange={setChecking}
            onAnswered={(id, saved) => {
              setResults((prev) => ({ ...prev, [id]: saved.correct }));
              setSavedAnswers((prev) => ({ ...prev, [id]: saved }));
              setSummary((prev) => prev ? { ...prev, scoreNeedsRefresh: true } : prev);
            }}
          />
        ))}
      </div>
    ))}
    {[3, 4, 5].map((stepIndex) => <div key={steps[stepIndex]} hidden={step !== stepIndex}>
      <PracticeItemPager
        label={`Vocabulary ${steps[stepIndex]}`}
        initiallyAnswered={progress?.answers ?? {}}
        items={groups[stepIndex].map((q) => ({
          id: q.id,
          content: <PracticeQuestion key={q.id} question={q} week={exercises.week} signedIn={signedIn}
            saved={savedAnswers[q.id]} largeOptions finishing={busy} onCheckingChange={setChecking}
            onAnswered={(id, saved) => {
              setResults((prev) => ({ ...prev, [id]: saved.correct }));
              setSavedAnswers((prev) => ({ ...prev, [id]: saved }));
              setSummary((prev) => prev ? { ...prev, scoreNeedsRefresh: true } : prev);
            }}
          />,
        }))}
      />
    </div>)}
    <div hidden={step !== 6}>
      <PracticeItemPager
        label="Vocabulary Your sentences"
        initiallyAnswered={progress?.answers ?? {}}
        items={exercises.yourSentence.map((q) => ({
          id: q.id,
          content: <SentenceBox key={q.id} week={exercises.week} id={q.id} prompt={q.prompt} signedIn={signedIn}
            rows={2} initialAnswer={savedAnswers[q.id]?.answer} freezeWhileChecking
            onChecked={(onTarget, answer) => {
              setResults((prev) => ({ ...prev, [q.id]: onTarget }));
              setSavedAnswers((prev) => ({ ...prev, [q.id]: { answer, correct: onTarget, reason: null } }));
            }}
          />,
        }))}
      />
    </div>
    <div className="flex justify-between gap-2">
      <button type="button" disabled={step === 0} onClick={() => { setStep(s => s - 1); focusStep(); }} className="rounded-lg border px-4 py-2 disabled:opacity-40">Previous step</button>
      {lastStep ? (
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            disabled={!signedIn || busy || checking || !canFinishRule(planned, results)}
            onClick={finish}
            className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Finish vocabulary'}
          </button>
          {checking ? (
            <span role="status" className="text-xs text-stone-600">Checking your answers. Please wait to finish.</span>
          ) : signedIn && !summary && finishHint(planned, results) && (
            <span className="text-xs text-stone-600">{finishHint(planned, results)}</span>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => { setStep(s => s + 1); focusStep(); }} className="rounded-lg bg-indigo-700 px-4 py-2 text-white">Next step</button>
      )}
    </div>
  </section>;
}

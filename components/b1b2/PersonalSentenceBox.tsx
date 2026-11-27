'use client';

import { ACTION_BUTTON_CLASS } from '@/lib/curriculum/week-tasks.mjs';
import { useRef, useState } from 'react';
import type { SentencePractice, SentenceVersion } from '@/lib/curriculum/week-sentence-practice';
import type { GrammarUseItFeedback } from '@/lib/b1b2/grammar-use-it-feedback';
import type { SentenceFeedback } from '@/lib/b1b2/week-sentence-feedback';

type Guidance = { pattern: string; starters?: string[]; starter?: string };

function Feedback({ version, rewrite }: { version: SentenceVersion; rewrite: boolean }) {
  const feedback = version.feedback;
  if ('target' in feedback) {
    const grammar = feedback as GrammarUseItFeedback;
    return <div className="space-y-1 rounded-lg bg-white p-3 text-sm">
      <p><strong>This week&apos;s grammar: </strong>{grammar.target}</p>
      {rewrite ? <>
        <p><strong>What improved: </strong>{grammar.improved}</p>
        <p><strong>Still to fix: </strong>{grammar.stillToFix}</p>
      </> : grammar.otherPoints.length > 0 && <ul className="list-disc pl-5">
        {grammar.otherPoints.slice(0, 2).map((point, index) => <li key={`${index}:${point}`}>{point}</li>)}
      </ul>}
      <p><strong>Corrected version: </strong>{grammar.corrected}</p>
    </div>;
  }
  const sentence = feedback as SentenceFeedback;
  return <div className="space-y-1 rounded-lg bg-white p-3 text-sm">
    <p className="text-emerald-800">{sentence.good}</p>
    <p><strong>Corrected sentence: </strong>{sentence.corrected}</p>
    <p>{sentence.tip}</p>
  </div>;
}

/** The personal writing items: examples and checks are revealed deliberately. */
export default function PersonalSentenceBox({
  week, id, prompt, kind, guidance, signedIn, initial, initialAnswer, onChecked,
}: {
  week: number;
  id: string;
  prompt: string;
  kind: 'grammar-use-it' | 'vocabulary-sentence';
  guidance: Guidance;
  signedIn: boolean;
  initial?: SentencePractice;
  /** A pre-feature answer remains available, but does not spend the new checks. */
  initialAnswer?: string;
  onChecked?: (onTarget: boolean, answer: string) => void;
}) {
  const [saved, setSaved] = useState<SentencePractice>(initial ?? { first: null, second: null, draft: null });
  const [editing, setEditing] = useState(!initial?.first || Boolean(initial.draft && !initial.second));
  const [answer, setAnswer] = useState(initial?.draft ?? initial?.first?.answer ?? initialAnswer ?? '');
  const [examples, setExamples] = useState<string[]>([]);
  const [showStarters, setShowStarters] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exampleBusy, setExampleBusy] = useState(false);
  const [error, setError] = useState('');
  const [exampleError, setExampleError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [addedToReview, setAddedToReview] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputId = `sentence-${id}`;
  const maxExamples = kind === 'vocabulary-sentence' ? 2 : 1;
  const version = saved.first ? 2 : 1;

  function focusBox() {
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function insertStarter(starter: string) {
    const position = inputRef.current?.selectionStart ?? answer.length;
    const before = answer.slice(0, position);
    const after = answer.slice(position);
    const separator = before && !/\s$/.test(before) ? ' ' : '';
    // Insert rather than replace so a learner's existing draft is never lost.
    setAnswer(`${before}${separator}${starter}${after}`);
    setCopyMessage('');
    focusBox();
  }

  async function showExample() {
    setExampleBusy(true);
    setExampleError('');
    try {
      const params = new URLSearchParams({ week: String(week), id, number: String(examples.length + 1) });
      const response = await fetch(`/api/week/sentence/example?${params}`);
      const data = await response.json() as { example?: string };
      if (!response.ok || typeof data.example !== 'string') throw new Error('Example unavailable');
      setExamples((previous) => [...previous, data.example!]);
    } catch {
      setExampleError('We could not show the example. Please try again.');
    } finally {
      setExampleBusy(false);
    }
  }

  async function check() {
    setError('');
    setCopyMessage('');
    setBusy(true);
    try {
      const response = await fetch('/api/week/sentence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, id, answer, version }),
      });
      const data = await response.json() as {
        error?: string; copiedExample?: boolean; message?: string;
        first?: SentenceVersion; second?: SentenceVersion | null;
        onTarget?: boolean; addedToReview?: boolean;
      };
      if (!response.ok) {
        setError(data.error || 'We could not check your answer. Please try again.');
        return;
      }
      if (data.copiedExample) {
        setCopyMessage(data.message || 'Try to write about your own life.');
        return;
      }
      if (!data.first || typeof data.onTarget !== 'boolean') {
        setError('We could not save your answer. Please try again.');
        return;
      }
      setSaved({ first: data.first, second: data.second ?? null, draft: null });
      setAddedToReview(Boolean(data.addedToReview));
      setEditing(false);
      onChecked?.(data.onTarget, answer);
    } catch {
      setError('We could not check your answer. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function improve() {
    setAnswer(saved.draft ?? saved.first?.answer ?? '');
    setEditing(true);
    setError('');
    setAddedToReview(false);
    focusBox();
  }

  return <div className="space-y-3 rounded-xl bg-stone-50 p-4">
    <p id={`${inputId}-prompt`} className="font-medium">{prompt}</p>
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm">
      <strong>Pattern: </strong>{guidance.pattern}
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={showExample} disabled={exampleBusy || examples.length >= maxExamples}
        className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-800 disabled:opacity-50">
        {exampleBusy ? 'Loading…' : 'Show an example'}
      </button>
      {editing && <button type="button" onClick={() => kind === 'vocabulary-sentence' && guidance.starter
        ? insertStarter(guidance.starter) : setShowStarters((value) => !value)}
        aria-expanded={kind === 'grammar-use-it' ? showStarters : undefined}
        className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-800">
        Help me start
      </button>}
    </div>
    {examples.map((example, index) => <p key={`${index}:${example}`} className="rounded-lg bg-white p-3 text-sm">
      <strong>Example {index + 1}: </strong>{example}
    </p>)}
    {exampleError && <p role="alert" className="text-sm text-red-700">{exampleError}</p>}
    {showStarters && editing && guidance.starters && <div className="space-y-2 text-sm">
      <p>Choose a start, then add your own ideas:</p>
      <div className="flex flex-wrap gap-2">
        {guidance.starters.map((starter) => <button type="button" key={starter} onClick={() => insertStarter(starter)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-left text-indigo-800">{starter}</button>)}
      </div>
    </div>}

    {saved.first && <section aria-label="Your first version" className="space-y-2">
      <p className="text-sm"><strong>Your first version: </strong>{saved.first.answer}</p>
      <Feedback version={saved.first} rewrite={false} />
    </section>}
    {saved.second && <section aria-label="Your second version" className="space-y-2">
      <p className="text-sm"><strong>Your second version: </strong>{saved.second.answer}</p>
      <Feedback version={saved.second} rewrite={kind === 'grammar-use-it'} />
    </section>}
    {addedToReview && <p className="text-sm text-stone-600">I added this to your Review cards so you can practise it again.</p>}

    {editing && !saved.second && <>
      <label htmlFor={inputId} className="block text-sm font-medium">
        {saved.first ? 'Write your improved version' : 'Your answer'}
      </label>
      <textarea id={inputId} ref={inputRef} value={answer} rows={kind === 'grammar-use-it' ? 3 : 2}
        maxLength={kind === 'grammar-use-it' ? 600 : 500} disabled={busy}
        aria-describedby={`${inputId}-prompt ${inputId}-help`}
        onChange={(event) => { setAnswer(event.target.value); setCopyMessage(''); }}
        className="w-full rounded-lg border border-stone-300 bg-white p-2" placeholder="Write about your own life." />
      <p id={`${inputId}-help`} className="text-sm text-stone-600">
        Write your sentences and press Check. The app will give you feedback.
        {kind === 'grammar-use-it' ? ' Write 2–3 sentences about your own life.' : ' Write about your own life.'}
      </p>
      <button type="button" disabled={!signedIn || busy || !answer.trim()} onClick={check}
        className={ACTION_BUTTON_CLASS}>
        {busy ? 'Checking…' : 'Check'}
      </button>
    </>}
    {saved.first && !saved.second && !editing && <button type="button" onClick={improve}
      className={ACTION_BUTTON_CLASS}>
      {kind === 'grammar-use-it' ? 'Improve it' : 'Try again'}
    </button>}
    {saved.second && <p className="text-sm text-stone-600">You have checked this item twice.</p>}
    {copyMessage && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{copyMessage}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}

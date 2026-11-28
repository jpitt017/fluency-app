'use client';

import { useRef, useState } from 'react';
import { countWords, writingTaskStatus } from '@/lib/b1b2/text-utils.mjs';
import {
  buildParagraphPlanPrompts,
  filterTaskMatchingGrammarIdeas,
  highlightModelAnswer,
  starterInsertText,
  wordRangeForWeek,
  type ModelPhraseHighlight,
} from '@/lib/curriculum/week-writing-support.mjs';
import WritingTaskInputs from '@/components/b1b2/WritingTaskInputs';
import type { WritingCallForArticles, WritingInputEmail } from '@/lib/curriculum/details';
import type { LessonLabContext } from './LessonLabContext';

export interface WritingScaffold {
  prompt?: string;
  targetKeywords?: string[];
}

export interface WritingLabProps {
  prompt?: string;
  targetKeywords?: string[];
  scaffold?: WritingScaffold;
  onSpeak?: (text: string) => void;
  lessonContext?: LessonLabContext;
  compactLesson?: boolean;
  unlockedModel?: string | null;
  /** Corrected personal sentences from this exact week's grammar practice. */
  grammarIdeas?: string[];
  planFrame?: string[];
  usefulLanguage?: string[];
  linkers?: string[];
  wordRange?: [number, number];
  inputEmail?: WritingInputEmail | null;
  callForArticles?: WritingCallForArticles | null;
}

interface WritingAreaItem {
  score: number;
  strength: string;
  improvement: string;
}

interface WritingCorrectionItem {
  original: string;
  corrected_sentence: string;
  explanation: string;
}

interface WritingFeedbackResponse {
  corrected?: string;
  feedback?: string;
  notes?: string[];
  corrections?: WritingCorrectionItem[];
  areas?: {
    content: WritingAreaItem;
    communicative_achievement: WritingAreaItem;
    organisation: WritingAreaItem;
    language: WritingAreaItem;
  };
  wordCount?: number;
  contentCappedUnder100?: boolean;
  wordCountTip?: string | null;
  passed?: boolean;
  submissionId?: string | null;
  modelAnswer?: string | null;
  weekRecorded?: boolean | null;
}

const WRITING_AREAS_META = [
  {
    key: 'content' as const,
    label: 'Content',
    question: 'Did you answer every part of the task?',
  },
  {
    key: 'communicative_achievement' as const,
    label: 'Communicative achievement',
    question: 'Does it sound right for your reader?',
  },
  {
    key: 'organisation' as const,
    label: 'Organisation',
    question: 'Is it easy to follow?',
  },
  {
    key: 'language' as const,
    label: 'Language',
    question: 'Are your grammar and words clear?',
  },
];

type ModelSegment =
  | { kind: 'plain'; text: string }
  | { kind: 'highlight'; text: string; highlight: ModelPhraseHighlight; index: number };

function segmentModelText(text: string, highlights: ModelPhraseHighlight[]): ModelSegment[] {
  if (!text || !highlights.length) return [{ kind: 'plain', text }];
  const valid = highlights
    .map((highlight, index) => ({ highlight, index, pos: text.indexOf(highlight.substring) }))
    .filter((item) => item.pos >= 0 && item.highlight.substring.length > 0)
    .sort((a, b) => a.pos - b.pos);
  if (!valid.length) return [{ kind: 'plain', text }];

  const segments: ModelSegment[] = [];
  let cursor = 0;
  for (const item of valid) {
    const pos = text.indexOf(item.highlight.substring, cursor);
    if (pos < 0) continue;
    if (pos > cursor) segments.push({ kind: 'plain', text: text.slice(cursor, pos) });
    segments.push({
      kind: 'highlight',
      text: item.highlight.substring,
      highlight: item.highlight,
      index: item.index,
    });
    cursor = pos + item.highlight.substring.length;
  }
  if (cursor < text.length) segments.push({ kind: 'plain', text: text.slice(cursor) });
  return segments;
}

export default function WritingLab({
  prompt,
  targetKeywords,
  scaffold,
  onSpeak,
  lessonContext,
  compactLesson = false,
  unlockedModel = null,
  grammarIdeas = [],
  planFrame = [],
  usefulLanguage = [],
  linkers = [],
  wordRange,
  inputEmail = null,
  callForArticles = null,
}: WritingLabProps) {
  const activePrompt =
    lessonContext?.prompt ??
    prompt ??
    scaffold?.prompt ??
    'Write a short B1 → B2 response using clear linkers and everyday vocabulary.';
  const activeKeywords = (
    lessonContext?.targetVocabulary ??
    targetKeywords ??
    scaffold?.targetKeywords ??
    []
  ).slice(0, 4);

  const weekNum = lessonContext?.weekNumber ?? null;
  const rules = wordRangeForWeek(weekNum);
  const minWords = wordRange?.[0] ?? rules.min;
  const maxWords = wordRange?.[1] ?? rules.max;

  const [planNotes, setPlanNotes] = useState<string[]>(() =>
    Array.from({ length: 4 }, () => ''),
  );
  const [text, setText] = useState('');
  const [revisedFrom, setRevisedFrom] = useState<string | null>(null);
  const [improving, setImproving] = useState(false);
  const [result, setResult] = useState<WritingFeedbackResponse | null>(null);
  const [activeModelIdx, setActiveModelIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isWeeklyTask = Boolean(weekNum);
  const wordCount = countWords(text);
  const wordStatus = writingTaskStatus(text, 20, isWeeklyTask ? minWords : 60);

  const paragraphPrompts = buildParagraphPlanPrompts(planFrame, usefulLanguage, weekNum);
  const matchingGrammarIdeas = filterTaskMatchingGrammarIdeas(
    grammarIdeas,
    weekNum,
    activeKeywords,
  );

  const modelText = result?.modelAnswer || unlockedModel || null;
  const modelHighlights = modelText
    ? highlightModelAnswer(modelText, weekNum, linkers)
    : [];
  const modelSegments = modelText ? segmentModelText(modelText, modelHighlights) : [];
  const activeModelHighlight =
    activeModelIdx !== null ? modelHighlights[activeModelIdx] ?? null : null;

  function insertStarter(template: string, startNewParagraph = false) {
    const snippet = starterInsertText(template);
    if (!snippet) return;
    const el = textareaRef.current;
    setText((current) => {
      if (!current.trim()) return snippet;
      if (el && typeof el.selectionStart === 'number' && el.selectionStart < current.length) {
        const start = el.selectionStart;
        const end = el.selectionEnd ?? start;
        const before = current.slice(0, start);
        const after = current.slice(end);
        const spacer = before && !/\s$/.test(before) ? ' ' : '';
        return `${before}${spacer}${snippet}${after}`;
      }
      if (startNewParagraph && !current.endsWith('\n\n')) {
        return `${current.replace(/\s+$/, '')}\n\n${snippet}`;
      }
      const spacer = /\s$/.test(current) ? '' : ' ';
      return `${current}${spacer}${snippet}`;
    });
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }

  function handleImproveIt() {
    setRevisedFrom(result?.submissionId || 'revised-draft');
    setImproving(true);
    textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }

  async function handleCheckWriting() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const target = lessonContext;
      const response = await fetch('/api/writing/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          prompt: `${activePrompt}${target?.targetGrammar?.length ? ` Target grammar: ${target.targetGrammar.join(', ')}.` : ''}`,
          targetKeywords: activeKeywords,
          weekNumber: lessonContext?.weekNumber,
          ...(revisedFrom ? { revisedFrom } : {}),
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | (WritingFeedbackResponse & { error?: string })
        | null;
      if (!response.ok || !data) {
        console.error('[writing] check failed:', data?.error ?? response.status);
        setError(data?.error || 'We could not check your work. Please try again.');
        return;
      }
      setResult(data);
      setImproving(false);
      lessonContext?.onComplete?.({ text, passed: data.passed });
    } catch (caught) {
      console.error('[writing] check failed:', caught);
      setError('We could not check your work. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={compactLesson ? 'space-y-3' : 'space-y-4'}>
      {compactLesson ? (
        <p className="text-sm leading-6 text-stone-700">
          <span className="font-semibold text-stone-900">Task:</span> {activePrompt}
        </p>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3.5">
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
              Writing practice
              {lessonContext?.mode === 'drill'
                ? ' · Guided task'
                : isWeeklyTask
                  ? ` · Week ${lessonContext?.weekNumber} (${minWords}–${maxWords} words)`
                  : ' · Free practice'}
            </span>
            <p className="mt-1 text-sm font-medium text-stone-800">{activePrompt}</p>
          </div>
          {onSpeak && (
            <button
              type="button"
              onClick={() => onSpeak(activePrompt)}
              className="shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700"
            >
              Listen
            </button>
          )}
        </div>
      )}

      {!compactLesson && (lessonContext?.targetGrammar?.length ?? 0) > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">
            Grammar to try
          </p>
          <ul className="space-y-1">
            {lessonContext?.targetGrammar?.map((item) => (
              <li
                key={item}
                className="rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-1.5 text-sm text-indigo-950"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeKeywords.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">
            Target words
          </p>
          <div className="flex flex-wrap gap-1.5">
            {activeKeywords.map((keyword) => (
              <span
                key={keyword}
                className="rounded-full border border-stone-200 bg-stone-100 px-2.5 py-1 text-sm font-medium text-stone-800"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>
      )}

      <WritingTaskInputs inputEmail={inputEmail} callForArticles={callForArticles} />

      {/* 3c. Useful phrases from usefulLanguage */}
      {usefulLanguage.length > 0 && (
        <section className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5">
          <h3 className="text-sm font-semibold text-indigo-950">Useful phrases</h3>
          <p className="text-sm text-stone-700">Tap any phrase to add it to your writing.</p>
          <div className="flex flex-wrap gap-1.5">
            {usefulLanguage.map((phrase) => (
              <button
                key={phrase}
                type="button"
                onClick={() => insertStarter(phrase, false)}
                className="min-h-9 max-w-full rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-left text-sm font-medium text-indigo-950 transition hover:bg-indigo-100"
              >
                + {phrase}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Matching grammar-practice sentences, folded away */}
      {matchingGrammarIdeas.length > 0 && (
        <details className="rounded-xl border border-stone-200 bg-stone-50 p-3.5">
          <summary className="cursor-pointer text-sm font-semibold text-stone-800">
            Your grammar-practice sentences ({matchingGrammarIdeas.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-700">
            {matchingGrammarIdeas.map((idea, index) => (
              <li key={`${index}:${idea}`}>{idea}</li>
            ))}
          </ul>
        </details>
      )}

      {/* 3a. Plan step: 4 short note boxes, one per paragraph */}
      {planFrame.length > 0 && (
        <section
          aria-label="Plan your four paragraphs"
          className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3.5"
        >
          <div>
            <h3 className="text-sm font-semibold text-stone-900">1. Plan your 4 paragraphs</h3>
            <p className="text-sm text-stone-600">Write a few quick words for each paragraph before you start.</p>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {planFrame.slice(0, 4).map((frame, idx) => (
              <label key={frame} className="min-w-0 space-y-1 text-sm">
                <span className="block font-medium text-stone-800">
                  Paragraph {idx + 1}: {frame}
                </span>
                <input
                  type="text"
                  value={planNotes[idx] ?? ''}
                  onChange={(e) =>
                    setPlanNotes((current) => {
                      const next = [...current];
                      next[idx] = e.target.value;
                      return next;
                    })
                  }
                  maxLength={160}
                  placeholder="A few words…"
                  aria-label={`Paragraph ${idx + 1} plan: ${frame}`}
                  className="min-h-10 w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm text-stone-900 placeholder:text-stone-500 focus:border-indigo-500 focus:outline-none"
                />
              </label>
            ))}
          </div>
        </section>
      )}

      {/* 3b. Write step: paragraph prompts with 2–3 tap-to-insert starters + writing box + live word count */}
      <div className="space-y-3">
        {paragraphPrompts.length > 0 && (
          <section aria-label="Paragraph prompts and starters" className="space-y-2">
            <h3 className="text-sm font-semibold text-stone-900">
              2. Write ({minWords}–{maxWords} words)
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {paragraphPrompts.map((item, idx) => (
                <div
                  key={item.paragraph}
                  className="min-w-0 space-y-1.5 rounded-lg border border-stone-200 bg-stone-50/80 p-2.5"
                >
                  <p className="text-sm font-medium text-stone-800">
                    <strong>P{item.paragraph}.</strong> {item.prompt}
                  </p>
                  {planNotes[idx]?.trim() && (
                    <p className="text-sm text-indigo-900">
                      <em>Note:</em> {planNotes[idx]}
                    </p>
                  )}
                  {item.starters.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {item.starters.map((starter) => (
                        <button
                          key={starter}
                          type="button"
                          onClick={() => insertStarter(starter, item.paragraph > 1)}
                          className="min-h-9 max-w-full rounded-md border border-indigo-200 bg-white px-2 py-1 text-left text-xs font-medium text-indigo-900 transition hover:bg-indigo-50"
                        >
                          + {starter}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {improving && (
          <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-950">
            Improve your draft below using a phrase from the model, then check it again.
          </p>
        )}

        <textarea
          ref={textareaRef}
          rows={7}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            compactLesson
              ? 'Write your sentences here…'
              : `Write your B1 → B2 response here (aim for ${minWords}–${maxWords} words)…`
          }
          className="w-full rounded-xl border border-stone-300 bg-white p-3.5 text-sm text-stone-900 placeholder:text-stone-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
            <span className="font-semibold text-stone-800" aria-live="polite">
              {wordCount} {wordCount === 1 ? 'word' : 'words'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-medium">
              Target: {minWords}–{maxWords} words
            </span>
            {wordCount >= minWords && wordCount <= maxWords && (
              <span className="font-semibold text-emerald-700">
                Target met ({minWords}–{maxWords} words)
              </span>
            )}
            {wordCount > rules.warnOver && (
              <span className="font-semibold text-amber-800">
                Try to keep to {minWords}–{maxWords} words.
              </span>
            )}
            {wordCount > 0 && wordCount < rules.capUnder && (
              <span className="text-stone-600">
                Write at least {rules.capUnder} words so Content is not capped at 3.
              </span>
            )}
            {!wordStatus.meetsMinimum && text.trim() && wordCount >= rules.capUnder && (
              <span className="text-stone-600">{wordStatus.message}</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleCheckWriting}
            disabled={loading || !text.trim()}
            className="min-h-11 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Analysing…' : improving ? 'Check improved draft' : 'Evaluate writing'}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {/* 3d. After first check: show modelAnswer with key phrases highlighted + one-line B1 reason on tap, then "Improve it" */}
      {modelText && (
        <section
          aria-label="Model answer"
          className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4"
        >
          <div>
            <h3 className="text-sm font-semibold text-emerald-950">Model answer</h3>
            {modelHighlights.length > 0 && (
              <p className="text-sm text-stone-600">
                Tap a highlighted phrase to see why it works, then improve your own draft.
              </p>
            )}
          </div>
          <p className="whitespace-pre-line rounded-lg border border-emerald-100 bg-white p-3.5 text-sm leading-7 text-stone-900">
            {modelSegments.map((seg, i) =>
              seg.kind === 'plain' ? (
                <span key={i}>{seg.text}</span>
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() =>
                    setActiveModelIdx((prev) => (prev === seg.index ? null : seg.index))
                  }
                  aria-expanded={activeModelIdx === seg.index}
                  className={`inline rounded px-1 py-0.5 text-left font-medium underline decoration-emerald-600 decoration-2 underline-offset-2 transition ${
                    activeModelIdx === seg.index
                      ? 'bg-emerald-200 text-emerald-950'
                      : 'bg-amber-100 text-stone-900 hover:bg-amber-200'
                  }`}
                >
                  {seg.text}
                </button>
              ),
            )}
          </p>

          {activeModelHighlight && (
            <div
              role="region"
              aria-label="Model phrase reason"
              className="rounded-lg border border-emerald-200 bg-white p-3 text-sm text-stone-800"
            >
              <p className="font-semibold text-emerald-900">
                {activeModelHighlight.label}: &ldquo;{activeModelHighlight.substring}&rdquo;
              </p>
              <p className="mt-1 text-stone-700">{activeModelHighlight.explanation}</p>
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={handleImproveIt}
              className="min-h-11 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
            >
              Improve it
            </button>
          </div>
        </section>
      )}

      {result && (
        <div role="status" className="space-y-4 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm">
          {result.weekRecorded === true && (
            <p className="font-semibold text-emerald-800">
              This counts for Week {lessonContext?.weekNumber}.
            </p>
          )}
          {result.weekRecorded === false && (
            <p role="alert" className="font-semibold text-rose-700">
              We could not count this for Week {lessonContext?.weekNumber}. Please try again.
            </p>
          )}
          {typeof result.passed === 'boolean' && (
            <p className={result.passed ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>
              {result.passed
                ? "Well done! You can now do this week's goal."
                : 'Review your feedback and try again'}
            </p>
          )}

          {result.wordCountTip && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              {result.wordCountTip}
            </p>
          )}

          {result.areas && (
            <section aria-label="Writing feedback by area" className="space-y-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-600">
                Your four areas (0–5 each)
              </span>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {WRITING_AREAS_META.map((meta) => {
                  const item = result.areas?.[meta.key];
                  if (!item) return null;
                  return (
                    <div
                      key={meta.key}
                      className="space-y-1.5 rounded-lg border border-stone-200 bg-white p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-stone-900">{meta.label}</span>
                        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-800">
                          {item.score} / 5
                        </span>
                      </div>
                      <p className="text-sm text-stone-600">{meta.question}</p>
                      {meta.key === 'content' && result.contentCappedUnder100 && (
                        <p className="text-sm font-medium text-amber-800">
                          Under {rules.capUnder} words: Content is capped at 3 / 5.
                        </p>
                      )}
                      <p className="text-sm text-emerald-900">
                        <strong>Good:</strong> {item.strength}
                      </p>
                      <p className="text-sm text-stone-700">
                        <strong>Next step:</strong> {item.improvement}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {result.feedback && (
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-600">
                Feedback
              </span>
              <p className="mt-1 whitespace-pre-wrap text-stone-700">{result.feedback}</p>
            </div>
          )}

          {Array.isArray(result.corrections) && result.corrections.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-600">
                Key corrections (up to 3)
              </span>
              <ul className="space-y-2">
                {result.corrections.slice(0, 3).map((item, idx) => (
                  <li key={idx} className="rounded-lg border border-stone-200 bg-white p-3 text-sm">
                    <p className="text-stone-600">
                      <strong>You wrote:</strong> {item.original}
                    </p>
                    <p className="mt-1 font-medium text-emerald-900">
                      <strong>Better:</strong> {item.corrected_sentence}
                    </p>
                    <p className="mt-1 text-stone-700">{item.explanation}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.corrected && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  A better way to say it
                </span>
                {onSpeak && (
                  <button
                    type="button"
                    onClick={() => onSpeak(result.corrected!)}
                    className="text-sm text-indigo-700"
                  >
                    Listen
                  </button>
                )}
              </div>
              <p className="whitespace-pre-line rounded-lg border border-stone-200 bg-white p-3 text-stone-800">
                {result.corrected}
              </p>
            </div>
          )}

          {Array.isArray(result.notes) && result.notes.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-stone-700">
              {result.notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { countWords, writingTaskStatus } from '@/lib/b1b2/text-utils.mjs';
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

export default function WritingLab({
  prompt,
  targetKeywords,
  scaffold,
  onSpeak,
  lessonContext,
  compactLesson = false,
  unlockedModel = null,
  grammarIdeas = [],
  inputEmail = null,
  callForArticles = null,
}: WritingLabProps) {
  const activePrompt =
    lessonContext?.prompt ??
    prompt ??
    scaffold?.prompt ??
    'Write a short B1 → B2 response using clear linkers and everyday vocabulary.';
  const activeKeywords =
    lessonContext?.targetVocabulary ?? targetKeywords ?? scaffold?.targetKeywords ?? [];
  const [text, setText] = useState('');
  const [result, setResult] = useState<WritingFeedbackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isWeeklyTask = Boolean(lessonContext?.weekNumber);
  const wordCount = countWords(text);
  const wordStatus = writingTaskStatus(text, 20, isWeeklyTask ? 120 : 60);

  async function handleCheckWriting() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
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
        <div className="flex items-start justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3.5">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
              Writing practice
              {lessonContext?.mode === 'drill' ? ' · Guided task' : isWeeklyTask ? ` · Week ${lessonContext?.weekNumber} (120–150 words)` : ' · Free practice'}
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

      {!compactLesson && lessonContext?.targetGrammar?.length ? (
        <div>
          <p className="text-xs font-medium text-stone-500">Target grammar</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {lessonContext.targetGrammar.map((item) => (
              <span
                key={item}
                className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {activeKeywords.length > 0 && (
        <div>
          <p className="text-xs font-medium text-stone-500">Target vocabulary</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {activeKeywords.map((keyword) => (
              <span
                key={keyword}
                className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>
      )}

      {grammarIdeas.length > 0 && (
        <section className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <h3 className="font-semibold">Ideas from your grammar practice</h3>
          <p className="text-sm text-stone-700">
            These are your corrected sentences. Use them if they help.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {grammarIdeas.map((idea, index) => (
              <li key={`${index}:${idea}`}>{idea}</li>
            ))}
          </ul>
        </section>
      )}

      <WritingTaskInputs inputEmail={inputEmail} callForArticles={callForArticles} />

      <textarea
        rows={6}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={
          compactLesson
            ? 'Write your sentences here…'
            : 'Write your B1 → B2 response here (aim for 120–150 words)…'
        }
        className="w-full rounded-xl border border-stone-300 bg-white p-3.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
          <span className="font-medium">Target: 120–150 words</span>
          <span aria-hidden="true">·</span>
          <span aria-live="polite">{wordStatus.message}</span>
          {wordCount > 180 && (
            <span className="font-medium text-amber-800">Try to keep to 120–150 words.</span>
          )}
          {!wordStatus.meetsMinimum && text.trim() && (
            <span className="text-stone-400">Add a little more to get useful feedback</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCheckWriting}
          disabled={loading || !text.trim()}
          className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Analysing…' : 'Evaluate writing'}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {(result?.modelAnswer || unlockedModel) && (
        <section className="rounded-xl border border-emerald-200 p-4">
          <h3 className="font-semibold">Model answer</h3>
          <p className="mt-2 whitespace-pre-line text-sm">{result?.modelAnswer || unlockedModel}</p>
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
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              {result.wordCountTip}
            </p>
          )}

          {result.areas && (
            <section aria-label="Writing feedback by area" className="space-y-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
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
                      <p className="text-xs text-stone-500">{meta.question}</p>
                      {meta.key === 'content' && result.contentCappedUnder100 && (
                        <p className="text-xs font-medium text-amber-800">
                          Under 100 words: Content is capped at 3 / 5.
                        </p>
                      )}
                      <p className="text-xs text-emerald-900">
                        <strong>Good:</strong> {item.strength}
                      </p>
                      <p className="text-xs text-stone-700">
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
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Feedback
              </span>
              <p className="mt-1 whitespace-pre-wrap text-stone-700">{result.feedback}</p>
            </div>
          )}

          {Array.isArray(result.corrections) && result.corrections.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Key corrections (up to 3)
              </span>
              <ul className="space-y-2">
                {result.corrections.slice(0, 3).map((item, idx) => (
                  <li key={idx} className="rounded-lg border border-stone-200 bg-white p-3 text-xs">
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
                    className="text-xs text-indigo-700"
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

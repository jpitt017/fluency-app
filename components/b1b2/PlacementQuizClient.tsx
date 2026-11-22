'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { countWords, fetchWithTimeout, writingTaskStatus } from '@/lib/b1b2/text-utils.mjs';
import type { PlacementQuestionRow, PlacementTextRow } from '@/lib/b1b2/types';

type Placement = 'foundation' | 'stage1' | 'stage2';

const SCORE_TIMEOUT_MS = 30_000;
const WRITING_TIMEOUT_MS = 45_000;
const MIN_WRITING_WORDS = 15;
const TARGET_WRITING_WORDS = 60;

function placementRecommendation(placement: Placement) {
  if (placement === 'foundation') return { belowB1: true, band: 'Foundation', startLabel: 'Open Practice Labs →', startHref: '/labs', summary: 'Build your foundation before starting Stage 1.' };
  if (placement === 'stage1') return { belowB1: false, band: 'Stage 1', startLabel: 'Start Week 1 →', startHref: '/week/1', summary: 'Start with Stage 1.' };
  return { belowB1: false, band: 'Stage 2', startLabel: 'Start Week 17 →', startHref: '/week/17', summary: 'Start with Stage 2.' };
}

export default function PlacementQuizClient({ questions, texts }: { questions: PlacementQuestionRow[]; texts: PlacementTextRow[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [quizScore, setQuizScore] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [scoreError, setScoreError] = useState('');
  const [answers, setAnswers] = useState<number[]>([]);
  const [stage, setStage] = useState<'quiz' | 'writing' | 'done'>('quiz');
  const [writingSample, setWritingSample] = useState('');
  const [writingScore, setWritingScore] = useState<number | null>(null);
  const [writingFeedback, setWritingFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [stuck, setStuck] = useState(false);
  const router = useRouter();
  // Kept for auth checks only: creating the Supabase client inside a click handler
  // would add fetches between the click and the visible state change.
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return createClient();
  }, []);
  const question = questions[currentIndex];
  const missingPassage = Boolean(question?.text_id && !texts.some((text) => text.id === question.text_id));

  // Watchdog: never leave the learner on a button that produces no change.
  // Advancing is synchronous, so if the question has not changed 4 seconds after
  // an answer was picked and Continue is enabled, something swallowed the click.
  useEffect(() => {
    if (selectedOption === null) return;
    const timer = window.setTimeout(() => setStuck(true), 4000);
    return () => window.clearTimeout(timer);
  }, [currentIndex, selectedOption]);

  const writingStatus = writingTaskStatus(writingSample, MIN_WRITING_WORDS, TARGET_WRITING_WORDS);

  if (!questions.length) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-12">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
          <p className="text-sm text-stone-600">Placement questions are currently unavailable.</p>
          <Link href="/labs" className="mt-4 inline-block rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white">
            Open Practice Labs →
          </Link>
        </div>
      </main>
    );
  }

  function selectOption(index: number) {
    setStuck(false);
    setSelectedOption(index);
  }

  function handleNextQuestion() {
    if (selectedOption === null) return;
    setStuck(false);
    setAnswers((previous) => [...previous, selectedOption]);
    setSelectedOption(null);

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setStage('writing');
    }
  }

  async function finishPlacement(skipWriting = false) {
    setLoading(true);
    let evaluatedScore: number | null = null;
    let feedbackText = '';
    let scored: number;
    let resultPlacement: Placement;
    setScoreError('');

    // The last answer may still be held in the click's state update.
    const submittedAnswers = answers.length === questions.length ? answers : [...answers, selectedOption].filter((answer): answer is number => typeof answer === 'number');

    try {
      const scoreRes = await fetchWithTimeout('/api/placement/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: submittedAnswers }),
      }, SCORE_TIMEOUT_MS, 'Scoring is taking longer than usual. Please check your connection and try again.');
      if (!scoreRes.ok) throw new Error('Scoring unavailable');
      const data = (await scoreRes.json()) as { score: number; placement: Placement };
      if (!Number.isInteger(data.score) || !['foundation', 'stage1', 'stage2'].includes(data.placement)) throw new Error('Invalid score');
      scored = data.score;
      resultPlacement = data.placement;
    } catch (error) {
      setScoreError(error instanceof Error && error.message.startsWith('Scoring is taking') ? error.message : 'Could not score your answers. Please try again.');
      setLoading(false);
      return;
    }
    setPlacement(resultPlacement);
    setQuizScore(scored);

    const sample = writingSample.trim();
    if (!skipWriting && countWords(sample) >= MIN_WRITING_WORDS) {
      try {
        const res = await fetchWithTimeout('/api/writing/correct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: sample,
            prompt:
              'Placement writing sample (60–100 words): Why are you learning English to B2, and what topic do you want to discuss more confidently?',
            variety: 'British',
          }),
        }, WRITING_TIMEOUT_MS, 'Writing feedback timed out. Your quiz result still decides your starting point.');
        if (res.ok) {
          const data = (await res.json()) as { score?: number; feedback?: string };
          if (typeof data.score === 'number') evaluatedScore = data.score;
          if (typeof data.feedback === 'string') feedbackText = data.feedback;
        } else {
          feedbackText = 'Writing feedback is unavailable right now. Your quiz score still decides your starting point.';
        }
      } catch (error) {
        feedbackText = error instanceof Error && error.message.startsWith('Writing feedback timed out')
          ? error.message
          : 'Writing feedback is unavailable right now. Your quiz score still decides your starting point.';
      }
    }

    setWritingScore(evaluatedScore);
    setWritingFeedback(feedbackText);

    const rec = placementRecommendation(resultPlacement);
    try {
      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from('profiles')
            .update({
              onboarding_completed: true,
              placement_result: {
                score: scored,
                total: questions.length,
                writing_score: evaluatedScore,
                band: rec.band,
                completed_at: new Date().toISOString(),
              },
            })
            .eq('id', user.id);
          const { error: progressError } = await supabase.rpc('refresh_current_week');
          if (progressError) console.error('Failed to update current week:', progressError.message);
          router.refresh();
        }
      }
    } catch (err) {
      console.error('Failed to save placement result:', err);
    } finally {
      setLoading(false);
      setStage('done');
    }
  }

  const recommendation = placementRecommendation(placement ?? 'foundation');
  const continueLabel = currentIndex + 1 === questions.length ? 'Continue to Writing Sample →' : 'Next Question';

  return (
    <main className="mx-auto flex min-h-[calc(100vh-140px)] max-w-2xl items-center justify-center px-4 pb-24 pt-10 sm:px-6">
      <div className="w-full space-y-6 rounded-2xl border border-stone-200 bg-white p-8 shadow-xs">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
            English B1 → B2 · {questions.length}-questions and a writing task
          </span>
          {stage === 'quiz' ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <h1 className="text-xl font-bold text-stone-900">
                Question {currentIndex + 1} of {questions.length}
              </h1>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
                {question.area}
              </span>
            </div>
          ) : stage === 'writing' ? (
            <h1 className="mt-2 text-xl font-bold text-stone-900">
              Write a short text (optional)
            </h1>
          ) : (
            <h1 className="mt-2 text-2xl font-bold text-stone-900">Placement Check Complete</h1>
          )}
        </div>

        {stage === 'quiz' && (
          <div className="space-y-5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-indigo-700 transition-all"
                style={{ width: `${Math.round(((currentIndex + 1) / questions.length) * 100)}%` }}
              />
            </div>

            {question.text_id && (() => {
              const passage = texts.find((text) => text.id === question.text_id);
              return passage ? <section className="rounded-xl bg-stone-50 p-4" aria-label={`Reading ${passage.id === 'RA' ? 'A' : 'B'}`}>
                <h2 className="font-semibold">Reading {passage.id === 'RA' ? 'A' : 'B'}: {passage.title}</h2>
                <p className="mt-3 whitespace-pre-line text-sm leading-6">{passage.body}</p>
              </section> : <p role="alert">Reading text is unavailable. Please try again later.</p>;
            })()}
            <p className="text-sm font-medium leading-6 text-stone-800">{question.question}</p>

            <div className="space-y-2.5">
              {question.options.map((option, idx) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => selectOption(idx)}
                  className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
                    selectedOption === idx
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-950 shadow-2xs'
                      : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            {selectedOption === null && (
              <p className="text-xs text-stone-500">Choose one answer to continue.</p>
            )}
            {missingPassage && (
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                The reading passage for this question is unavailable, so it cannot be answered. Reload the page; if it keeps happening, use &quot;Problem? Tell us&quot;.
              </p>
            )}
            {stuck && (
              <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                The page did not move to the next question. Nothing was lost — press {continueLabel} again, or use &quot;Problem? Tell us&quot; if it keeps happening.
              </p>
            )}

            <button
              type="button"
              onClick={handleNextQuestion}
              disabled={selectedOption === null || missingPassage}
              className="w-full rounded-xl bg-indigo-700 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-800 disabled:opacity-50"
            >
              {continueLabel}
            </button>
          </div>
        )}

        {stage === 'writing' && (
          <div className="space-y-4">
            {scoreError && <p role="alert" className="text-red-700">{scoreError}</p>}
            <p className="text-sm leading-6 text-stone-700">
              Write 3–5 sentences (60–100 words) explaining why you want to reach B2 English and one topic you find difficult to discuss smoothly.
            </p>
            <textarea
              rows={4}
              value={writingSample}
              onChange={(e) => setWritingSample(e.target.value)}
              placeholder="Write a short paragraph here, or skip to use your 24-item quiz score…"
              className="w-full rounded-xl border border-stone-300 bg-stone-50/60 p-3 text-sm text-stone-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
              <span aria-live="polite" className="font-medium">
                {writingStatus.message}
              </span>
              <span>
                {writingStatus.meetsTarget ? 'Ready for feedback' : `Minimum ${MIN_WRITING_WORDS} words`}
              </span>
            </div>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <button
                type="button"
                disabled={loading || !writingStatus.meetsMinimum}
                onClick={() => void finishPlacement(false)}
                className="flex-1 rounded-xl bg-indigo-700 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
              >
                {loading ? 'Checking your writing…' : 'Evaluate Sample & Recommend Level'}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void finishPlacement(true)}
                className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50"
              >
                Skip sample
              </button>
            </div>
            {loading && (
              <p role="status" className="text-xs text-stone-600">
                This can take up to 45 seconds. If it runs over, you can skip the sample and keep your quiz result.
              </p>
            )}
          </div>
        )}

        {stage === 'done' && (
          <div className="space-y-5">
            <div
              className={`space-y-2 rounded-xl border p-5 ${
                recommendation.belowB1
                  ? 'border-amber-200 bg-amber-50/70'
                  : 'border-indigo-200 bg-indigo-50/70'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`text-xs font-semibold uppercase tracking-wider ${
                    recommendation.belowB1 ? 'text-amber-800' : 'text-indigo-700'
                  }`}
                >
                  Suggested Band: {recommendation.band}
                </span>
                <span className="text-sm font-bold text-stone-900">
                  Quiz {quizScore}/{questions.length}
                  {writingScore !== null ? ` · Writing ${writingScore}/100` : ''}
                </span>
              </div>
              <p className="text-sm leading-6 text-stone-700">{recommendation.summary}</p>
              {writingFeedback && (
                <p className="rounded-lg bg-white/80 p-2.5 text-xs text-stone-700">{writingFeedback}</p>
              )}
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row">
              <button
                type="button"
                onClick={() => router.push(recommendation.startHref)}
                disabled={loading}
                className="flex-1 rounded-xl bg-indigo-700 px-4 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-800 disabled:opacity-60"
              >
                {recommendation.startLabel}
              </button>
              <Link
                href="/dashboard"
                className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-center text-sm font-semibold text-stone-700 hover:bg-stone-100"
              >
                Open Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

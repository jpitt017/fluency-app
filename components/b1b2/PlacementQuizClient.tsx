'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import type { PlacementQuestionRow } from '@/lib/b1b2/types';

function placementRecommendation(score: number, total: number, writingScore: number | null) {
  const quizPct = total > 0 ? (score / total) * 100 : 0;
  const combinedPct = writingScore !== null ? quizPct * 0.65 + writingScore * 0.35 : quizPct;

  if (combinedPct < 35) {
    return {
      belowB1: true,
      band: 'Pre-B1 Foundation Recommended',
      startLabel: 'Open Practice Labs →',
      startHref: '/labs',
      summary:
        'Your diagnostic suggests locking in core A2/B1 basics (present simple/continuous, articles, quantifiers, prepositions, subject–verb agreement, and verb forms) before moving into upper-B1 fluency tasks.',
    };
  }
  if (combinedPct >= 80) {
    return {
      belowB1: false,
      band: 'B1+ / B2 Entry',
      startLabel: 'Open AI Speaking & Writing Labs →',
      startHref: '/labs',
      summary:
        'Strong control of B1–B1+ tenses, passives, deduction, and conditionals. Use the Speaking, Writing, and Shadowing Labs to sharpen hedging, register, and fluent interaction at B2.',
    };
  }
  if (combinedPct >= 60) {
    return {
      belowB1: false,
      band: 'B1 High',
      startLabel: 'Open Practice Labs →',
      startHref: '/labs',
      summary:
        'Solid B1 foundation. Practise deduction, reported speech, and extended speaking/writing tasks in the AI Labs and Review Studio on your way to B2.',
    };
  }
  return {
    belowB1: false,
    band: 'B1 Foundation',
    startLabel: 'Open Practice Labs →',
    startHref: '/labs',
    summary:
      'Focus on consolidating narrative tenses, present perfect vs. past simple, future forms, modals, and passive voice using the AI Labs and Error Review drills.',
  };
}

export default function PlacementQuizClient({ questions }: { questions: PlacementQuestionRow[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [quizScore, setQuizScore] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [stage, setStage] = useState<'quiz' | 'writing' | 'done'>('quiz');
  const [writingSample, setWritingSample] = useState('');
  const [writingScore, setWritingScore] = useState<number | null>(null);
  const [writingFeedback, setWritingFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return createClient();
  }, []);

      if (!questions.length) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
          <p className="text-sm text-stone-600">Placement questions are currently unavailable.</p>
          <Link href="/labs" className="mt-4 inline-block rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white">
            Open Practice Labs →
          </Link>
        </div>
      </main>
    );
  }

  function handleNextQuestion() {
    if (selectedOption === null) return;
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
    let scored = 0;

    try {
      const scoreRes = await fetch('/api/placement/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      if (scoreRes.ok) {
        const data = (await scoreRes.json()) as { score?: number };
        if (typeof data.score === 'number') scored = data.score;
      }
    } catch {
      // Offline: fall back to a zero quiz score rather than exposing keys client-side.
    }
    setQuizScore(scored);

    const sample = writingSample.trim();
    if (!skipWriting && sample.split(/\s+/).filter(Boolean).length >= 15) {
      try {
        const res = await fetch('/api/writing/correct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: sample,
            prompt:
              'Diagnostic placement sample (60–100 words): Why are you learning English to B2, and what topic do you want to discuss more confidently?',
            variety: 'British',
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { score?: number; feedback?: string };
          if (typeof data.score === 'number') evaluatedScore = data.score;
          if (typeof data.feedback === 'string') feedbackText = data.feedback;
        }
      } catch {
        /* Fallback to quiz-only placement if unauthenticated or offline */
      }
    }

    setWritingScore(evaluatedScore);
    setWritingFeedback(feedbackText);

    const rec = placementRecommendation(scored, questions.length, evaluatedScore);
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
        }
      }
    } catch (err) {
      console.error('Failed to save placement result:', err);
    } finally {
      setLoading(false);
      setStage('done');
    }
  }

  const recommendation = placementRecommendation(quizScore, questions.length, writingScore);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-140px)] max-w-2xl items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full space-y-6 rounded-2xl border border-stone-200 bg-white p-8 shadow-xs">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
            English B1 → B2 · {questions.length}-Item Diagnostic + Writing Check
          </span>
          {stage === 'quiz' ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <h1 className="text-xl font-bold text-stone-900">
                Question {currentIndex + 1} of {questions.length}
              </h1>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
                {questions[currentIndex].area}
              </span>
            </div>
          ) : stage === 'writing' ? (
            <h1 className="mt-2 text-xl font-bold text-stone-900">
              Optional 1-Paragraph Diagnostic Writing Sample
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

            <p className="text-sm font-medium leading-6 text-stone-800">{questions[currentIndex].question}</p>

            <div className="space-y-2.5">
              {questions[currentIndex].options.map((option, idx) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSelectedOption(idx)}
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

            <button
              type="button"
              onClick={handleNextQuestion}
              disabled={selectedOption === null}
              className="w-full rounded-xl bg-indigo-700 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-800 disabled:opacity-50"
            >
              {currentIndex + 1 === questions.length ? 'Continue to Writing Sample →' : 'Next Question'}
            </button>
          </div>
        )}

        {stage === 'writing' && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-stone-700">
              Grammar score: <strong>{quizScore} / {questions.length}</strong>. Write 3–5 sentences (60–100 words) explaining why you want to reach B2 English and one topic you find difficult to discuss smoothly.
            </p>
            <textarea
              rows={4}
              value={writingSample}
              onChange={(e) => setWritingSample(e.target.value)}
              placeholder="Write a short paragraph here, or skip to use your 24-item quiz score…"
              className="w-full rounded-xl border border-stone-300 bg-stone-50/60 p-3 text-sm text-stone-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <button
                type="button"
                disabled={loading || writingSample.trim().split(/\s+/).filter(Boolean).length < 15}
                onClick={() => void finishPlacement(false)}
                className="flex-1 rounded-xl bg-indigo-700 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
              >
                {loading ? 'Evaluating diagnostic…' : 'Evaluate Sample & Recommend Level'}
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

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import type { PlacementQuestionRow } from '@/lib/b1b2/types';

function placementRecommendation(score: number) {
  if (score >= 5) {
    return {
      band: 'B1+ / B2 Entry',
      startLesson: 33,
      startLabel: 'Start Module 5 · Lesson 33 (Environment & Society)',
      summary:
        'Strong control of B1 tenses and conditionals. Jump straight into Modules 5–8 to sharpen mixed conditionals, formal essays, inversion, and hedging.',
    };
  }
  if (score >= 3) {
    return {
      band: 'B1 Mid–High',
      startLesson: 17,
      startLabel: 'Start Module 3 · Lesson 17 (Travel & Culture)',
      summary:
        'Solid intermediate foundation. Starting at Module 3 builds passives, relative clauses, deduction, and reported speech on your way to B2.',
    };
  }
  return {
    band: 'B1 Foundation',
    startLesson: 1,
    startLabel: 'Start Module 1 · Lesson 1 (Everyday Fluency)',
    summary:
      'Begin at Module 1 to lock in present perfect vs. past simple, narrative tenses, and core daily collocations before accelerating.',
  };
}

export default function PlacementQuizClient({ questions }: { questions: PlacementQuestionRow[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
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
          <Link href="/curriculum/lessons/1" className="mt-4 inline-block rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white">
            Start Module 1 · Lesson 1 →
          </Link>
        </div>
      </main>
    );
  }

  async function handleNext() {
    if (selectedOption === null) return;

    const isCorrect = selectedOption === questions[currentIndex].answer_index;
    const newScore = isCorrect ? score + 1 : score;
    setScore(newScore);
    setSelectedOption(null);

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(currentIndex + 1);
      return;
    }

    setIsCompleted(true);
    setLoading(true);
    const rec = placementRecommendation(newScore);

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
                score: newScore,
                total: questions.length,
                band: rec.band,
                recommended_lesson: rec.startLesson,
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
    }
  }

  const recommendation = placementRecommendation(score);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-140px)] max-w-2xl items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full space-y-6 rounded-2xl border border-stone-200 bg-white p-8 shadow-xs">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
            English B1 → B2 · Placement Check
          </span>
          {!isCompleted ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <h1 className="text-xl font-bold text-stone-900">
                Question {currentIndex + 1} of {questions.length}
              </h1>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
                {questions[currentIndex].area}
              </span>
            </div>
          ) : (
            <h1 className="mt-2 text-2xl font-bold text-stone-900">Placement Check Complete</h1>
          )}
        </div>

        {!isCompleted ? (
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
              onClick={handleNext}
              disabled={selectedOption === null}
              className="w-full rounded-xl bg-indigo-700 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-800 disabled:opacity-50"
            >
              {currentIndex + 1 === questions.length ? 'Finish & View Recommendation' : 'Next Question'}
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/70 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
                  Suggested Band: {recommendation.band}
                </span>
                <span className="text-sm font-bold text-indigo-900">
                  {score} / {questions.length}
                </span>
              </div>
              <p className="text-sm leading-6 text-stone-700">{recommendation.summary}</p>
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row">
              <button
                type="button"
                onClick={() => router.push(`/curriculum/lessons/${recommendation.startLesson}`)}
                disabled={loading}
                className="flex-1 rounded-xl bg-indigo-700 px-4 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-800 disabled:opacity-60"
              >
                {recommendation.startLabel} →
              </button>
              <Link
                href="/curriculum"
                className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-center text-sm font-semibold text-stone-700 hover:bg-stone-100"
              >
                Browse all 64 lessons
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

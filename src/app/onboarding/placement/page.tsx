'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

const QUESTIONS = [
  {
    id: 1,
    area: 'Present perfect vs. past simple',
    question: 'Choose the sentence that correctly describes life experience without a finished time:',
    options: [
      'I visited three European capitals since 2022.',
      'I have visited Lisbon three times, and I loved it.',
      'I was visiting Lisbon three times in my life.',
      'I have started my first job in 2019.',
    ],
    answer: 1,
  },
  {
    id: 2,
    area: 'Narrative tenses',
    question: 'When I arrived at the station, the train ___ ten minutes earlier.',
    options: [
      'already left',
      'was already leaving',
      'had already left',
      'has already left',
    ],
    answer: 2,
  },
  {
    id: 3,
    area: 'Future forms & conditionals',
    question: 'Which sentence expresses diplomatic advice in a second conditional?',
    options: [
      'If I am you, I will negotiate the contract.',
      'If I were you, I would negotiate the terms before signing.',
      'If I had been you, I negotiate the salary.',
      'If I will be you, I would ask for a raise.',
    ],
    answer: 1,
  },
  {
    id: 4,
    area: 'Modals of deduction',
    question: 'The site is down on every device — they ___ be updating the servers right now.',
    options: [
      'must',
      "can't",
      'should',
      'would',
    ],
    answer: 0,
  },
  {
    id: 5,
    area: 'Concession linkers',
    question: '___ the criticism from local businesses, the council kept the pedestrian zone.',
    options: [
      'Whereas',
      'Consequently',
      'In spite of',
      'Nevertheless',
    ],
    answer: 2,
  },
  {
    id: 6,
    area: 'Inversion & hedging',
    question: 'Choose the most accurate B2 inverted sentence for emphasis:',
    options: [
      'Not only the policy cut emissions, but it also saved money.',
      'Not only did the policy cut emissions, but it also created jobs.',
      'Rarely I have seen such a compelling argument.',
      'Never the city has faced a decision like this.',
    ],
    answer: 1,
  },
];

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

export default function PlacementQuizPage() {
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

  async function handleNext() {
    if (selectedOption === null) return;

    const isCorrect = selectedOption === QUESTIONS[currentIndex].answer;
    const newScore = isCorrect ? score + 1 : score;
    setScore(newScore);
    setSelectedOption(null);

    if (currentIndex + 1 < QUESTIONS.length) {
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
                total: QUESTIONS.length,
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
                Question {currentIndex + 1} of {QUESTIONS.length}
              </h1>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
                {QUESTIONS[currentIndex].area}
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
                style={{ width: `${Math.round(((currentIndex + 1) / QUESTIONS.length) * 100)}%` }}
              />
            </div>

            <p className="text-sm font-medium leading-6 text-stone-800">{QUESTIONS[currentIndex].question}</p>

            <div className="space-y-2.5">
              {QUESTIONS[currentIndex].options.map((option, idx) => (
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
              {currentIndex + 1 === QUESTIONS.length ? 'Finish & View Recommendation' : 'Next Question'}
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
                  {score} / {QUESTIONS.length}
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

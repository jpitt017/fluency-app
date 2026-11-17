'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

const questions = [
  {
    id: 1,
    question: "Choose the correct British English phrasing for meeting someone informally:",
    options: [
      "How are you doing today, sir?",
      "Alright, mate?",
      "What is your current status?",
      "Good morning to you."
    ],
    answer: 1, // "Alright, mate?"
  },
  {
    id: 2,
    question: "Which modal verb best expresses polite advice in British English?",
    options: [
      "You must definitely do this immediately.",
      "You ought to give it a go.",
      "You shall do it now.",
      "You will have to try."
    ],
    answer: 1, // "You ought to give it a go."
  },
  {
    id: 3,
    question: "What does the British idiom 'cost the earth' mean?",
    options: [
      "To be extremely cheap",
      "To be environmentally friendly",
      "To cost a great deal of money",
      "To be buried underground"
    ],
    answer: 2, // "To cost a great deal of money"
  },
];

export default function PlacementQuizPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Safely instantiate Supabase only on client-side mount / window presence
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return createClient();
  }, []);

  const handleAnswer = (index: number) => {
    setSelectedOption(index);
  };

  const handleNext = async () => {
    if (selectedOption === null) return;

    const isCorrect = selectedOption === questions[currentIndex].answer;
    const newScore = isCorrect ? score + 1 : score;
    setScore(newScore);
    setSelectedOption(null);

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsCompleted(true);
      setLoading(true);

      try {
        if (supabase) {
          // Save placement result to Supabase progress logs
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from('progress_logs').insert({
              user_id: user.id,
              session_id: 'placement-assessment',
              score: newScore,
            });
          }
        }
      } catch (err) {
        console.error('Failed to save placement score:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-100 space-y-6">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
            🇬🇧 B1 British English Placement Assessment
          </span>
          {!isCompleted ? (
            <div className="flex justify-between items-center mt-2">
              <h1 className="text-xl font-bold text-gray-900">
                Question {currentIndex + 1} of {questions.length}
              </h1>
              <span className="text-xs text-gray-400 font-medium">
                {Math.round(((currentIndex + 1) / questions.length) * 100)}% Complete
              </span>
            </div>
          ) : (
            <h1 className="text-2xl font-bold text-gray-900 mt-1">Assessment Complete!</h1>
          )}
        </div>

        {!isCompleted ? (
          <div className="space-y-6">
            <p className="text-sm font-medium text-gray-800">
              {questions[currentIndex].question}
            </p>

            <div className="space-y-3">
              {questions[currentIndex].options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAnswer(idx)}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                    selectedOption === idx
                      ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-sm'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            <button
              onClick={handleNext}
              disabled={selectedOption === null}
              className="w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {currentIndex + 1 === questions.length ? 'Finish & Save' : 'Next Question'}
            </button>
          </div>
        ) : (
          <div className="space-y-6 text-center">
            <div className="bg-blue-50 border border-blue-100 p-6 rounded-xl space-y-2">
              <p className="text-sm text-blue-800 font-medium">Your B1 Assessment Score:</p>
              <p className="text-3xl font-extrabold text-blue-900">
                {score} / {questions.length}
              </p>
              <p className="text-xs text-blue-700">
                {score >= 2 
                  ? "Great job! You have a solid grasp of intermediate British English expressions."
                  : "Good effort! We recommend starting with our foundational B1 speaking labs."}
              </p>
            </div>

            <button
              onClick={() => router.push('/sessions/11111111-1111-1111-1111-000000000001')}
              disabled={loading}
              className="w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              Start Your First Session 🇬🇧
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
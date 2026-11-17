'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

interface SessionBlock {
  id: string;
  block_type: string;
  title: string;
  content: any;
  sequence_order: number;
}

interface LessonViewerClientProps {
  sessionId: string;
}

export default function LessonViewerClient({ sessionId }: LessonViewerClientProps) {
  const [blocks, setBlocks] = useState<SessionBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: number]: string }>({});
  const [feedback, setFeedback] = useState<{ [key: number]: boolean }>({});

  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }, []);

  useEffect(() => {
    async function fetchLessonData() {
      if (!sessionId || sessionId === 'placeholder-session' || !supabase) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .schema('course')
        .from('session_blocks')
        .select('*')
        .eq('session_id', sessionId)
        .order('sequence_order', { ascending: true });

      if (data) {
        setBlocks(data);
      }
      setLoading(false);
    }

    fetchLessonData();
  }, [sessionId, supabase]);

  const handleSelect = (questionIndex: number, option: string, correctOption: string) => {
    setSelectedAnswers({ ...selectedAnswers, [questionIndex]: option });
    setFeedback({
      ...feedback,
      [questionIndex]: option === correctOption,
    });
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading interactive British English lesson...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 font-sans text-gray-900">
      <header className="mb-8 border-b pb-4">
        <span className="text-sm font-semibold uppercase tracking-wider text-indigo-600">Module 1 Fluency Studio</span>
        <h1 className="text-3xl font-bold mt-1 text-gray-900">Interactive Lesson Viewer</h1>
      </header>

      {blocks.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg text-amber-800">
          {sessionId === 'placeholder-session' 
            ? 'Placeholder route successfully verified for build-time constraints.'
            : 'No content blocks found for this session yet. Please run your seeder or generator endpoint.'}
        </div>
      ) : (
        <div className="space-y-8">
          {blocks.map((block) => (
            <section key={block.id} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-3 text-indigo-900">{block.title}</h2>
              
              {block.content?.text && (
                <p className="text-gray-700 leading-relaxed mb-4">{block.content.text}</p>
              )}

              {block.content?.exercises && Array.isArray(block.content.exercises) && (
                <div className="space-y-6 mt-4">
                  {block.content.exercises.map((ex: any, idx: number) => (
                    <div key={idx} className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
                      <p className="font-medium text-gray-800 mb-3">
                        {idx + 1}. {ex.question}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {ex.options.map((option: string, optIdx: number) => {
                          const isSelected = selectedAnswers[idx] === option;
                          const isCorrectOption = option === ex.answer;
                          let btnStyle = "border-gray-300 bg-white text-gray-700 hover:bg-gray-100";

                          if (selectedAnswers[idx] !== undefined) {
                            if (isCorrectOption) {
                              btnStyle = "border-green-500 bg-green-50 text-green-800 font-medium";
                            } else if (isSelected) {
                              btnStyle = "border-red-400 bg-red-50 text-red-800";
                            }
                          }

                          return (
                            <button
                              key={optIdx}
                              onClick={() => handleSelect(idx, option, ex.answer)}
                              className={`border p-2.5 rounded-md text-left text-sm transition-all ${btnStyle}`}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                      {feedback[idx] !== undefined && (
                        <div className={`mt-3 text-sm font-medium ${feedback[idx] ? 'text-green-600' : 'text-red-600'}`}>
                          {feedback[idx] ? '✓ Correct! Well done.' : `✗ Incorrect. The correct answer is: ${ex.answer}`}
                          {ex.explanation && <p className="text-gray-600 text-xs mt-1">{ex.explanation}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
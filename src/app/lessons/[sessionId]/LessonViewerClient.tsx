'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import {
  COURSE_MODULES,
  COURSE_SESSIONS,
  type SessionBlockSpec,
} from '@/lib/course-architecture';

interface SessionBlock {
  id: string;
  block_number: number;
  block_type: string;
  title: string;
  start_minute: number;
  end_minute: number;
  description: string;
  content: Partial<SessionBlockSpec['content']>;
}

interface LessonViewerClientProps {
  sessionId: string;
}

const BLOCK_BADGE_STYLES: Record<string, string> = {
  pronunciation: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  language: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  listening: 'bg-amber-50 text-amber-800 border-amber-200',
  speaking: 'bg-purple-50 text-purple-700 border-purple-200',
};

export default function LessonViewerClient({ sessionId }: LessonViewerClientProps) {
  const [blocks, setBlocks] = useState<SessionBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, boolean>>({});

  const sessionMeta = useMemo(
    () => COURSE_SESSIONS.find((s) => s.id === sessionId),
    [sessionId],
  );
  const moduleMeta = useMemo(
    () => (sessionMeta ? COURSE_MODULES.find((m) => m.module_number === sessionMeta.module_number) : undefined),
    [sessionMeta],
  );

  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }, []);

  useEffect(() => {
    let active = true;
    async function fetchLessonData() {
      if (!sessionId || sessionId === 'placeholder-session') {
        if (active) setLoading(false);
        return;
      }

      if (supabase) {
        const { data } = await supabase
          .schema('course')
          .from('session_blocks')
          .select('*')
          .eq('session_id', sessionId)
          .order('block_number', { ascending: true });

        if (active && data && data.length > 0) {
          setBlocks(data as SessionBlock[]);
          setLoading(false);
          return;
        }
      }

      if (active && sessionMeta) {
        setBlocks(
          sessionMeta.blocks.map((b) => ({
            id: `${sessionMeta.id}-b${b.block_number}`,
            block_number: b.block_number,
            block_type: b.block_type,
            title: b.title,
            start_minute: b.start_minute,
            end_minute: b.end_minute,
            description: b.description,
            content: b.content,
          })),
        );
      }
      if (active) setLoading(false);
    }

    void fetchLessonData();
    return () => {
      active = false;
    };
  }, [sessionId, supabase, sessionMeta]);

  const handleSelect = (key: string, option: string, correctOption: string) => {
    setSelectedAnswers((prev) => ({ ...prev, [key]: option }));
    setFeedback((prev) => ({ ...prev, [key]: option === correctOption }));
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">
        Loading 120-minute interactive session...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 font-sans text-gray-900">
      <div className="mb-4">
        <Link href="/curriculum" className="text-sm font-medium text-indigo-700 hover:underline">
          ← Back to Curriculum
        </Link>
      </div>

      <header className="mb-8 border-b pb-5">
        <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
          {moduleMeta
            ? `Module ${moduleMeta.module_number}: ${moduleMeta.title} · Session ${sessionMeta?.session_number}/32`
            : 'Global English Fluency Studio (B1 → B2)'}
        </span>
        <h1 className="text-3xl font-bold mt-1 text-gray-900">
          {sessionMeta ? sessionMeta.title : 'Interactive Lesson Viewer'}
        </h1>
        {sessionMeta && (
          <p className="mt-2 text-sm text-gray-600">
            {sessionMeta.objectives} · {sessionMeta.duration_minutes} minutes (Hours{' '}
            {sessionMeta.course_hour_end - 1}–{sessionMeta.course_hour_end})
          </p>
        )}
        {sessionMeta?.milestone && (
          <p className="mt-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
            Milestone: {sessionMeta.milestone}
          </p>
        )}
      </header>

      {blocks.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg text-amber-800">
          {sessionId === 'placeholder-session'
            ? 'Placeholder route successfully verified for build-time constraints.'
            : 'No content blocks found for this session yet.'}
        </div>
      ) : (
        <div className="space-y-8">
          {blocks.map((block) => {
            const badgeStyle =
              BLOCK_BADGE_STYLES[block.block_type] ?? 'bg-gray-100 text-gray-700 border-gray-200';
            return (
              <section
                key={block.id}
                className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Block {block.block_number} · {String(block.start_minute).padStart(2, '0')}–
                    {block.end_minute} min
                  </span>
                  <span className={`text-xs font-semibold uppercase px-2.5 py-0.5 rounded-full border ${badgeStyle}`}>
                    {block.block_type}
                  </span>
                </div>

                <h2 className="text-xl font-semibold mb-2 text-indigo-900">{block.title}</h2>
                {block.description && (
                  <p className="text-sm text-gray-700 leading-relaxed mb-3">{block.description}</p>
                )}

                {block.content?.model_extract && (
                  <blockquote className="mb-4 rounded-lg border-l-4 border-indigo-400 bg-indigo-50/70 px-4 py-3 text-sm italic text-indigo-950">
                    Model Extract: {block.content.model_extract}
                  </blockquote>
                )}

                {Array.isArray(block.content?.key_points) && block.content.key_points.length > 0 && (
                  <ul className="mb-4 list-disc pl-5 space-y-1 text-sm text-gray-700">
                    {block.content.key_points.map((point: string, i: number) => (
                      <li key={i}>{point}</li>
                    ))}
                  </ul>
                )}

                {Array.isArray(block.content?.exercises) && block.content.exercises.length > 0 && (
                  <div className="space-y-4 mt-4">
                    {block.content.exercises.map((ex: SessionBlockSpec['content']['exercises'][number], idx: number) => {
                      const qKey = `${block.id}:${idx}`;
                      return (
                        <div key={qKey} className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
                          <p className="font-medium text-gray-800 mb-3">
                            {idx + 1}. {ex.question}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {ex.options.map((option: string, optIdx: number) => {
                              const isSelected = selectedAnswers[qKey] === option;
                              const isCorrectOption = option === ex.answer;
                              let btnStyle = 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100';

                              if (selectedAnswers[qKey] !== undefined) {
                                if (isCorrectOption) {
                                  btnStyle = 'border-green-500 bg-green-50 text-green-800 font-medium';
                                } else if (isSelected) {
                                  btnStyle = 'border-red-400 bg-red-50 text-red-800';
                                }
                              }

                              return (
                                <button
                                  key={optIdx}
                                  type="button"
                                  onClick={() => handleSelect(qKey, option, ex.answer)}
                                  className={`border p-2.5 rounded-md text-left text-sm transition-all ${btnStyle}`}
                                >
                                  {option}
                                </button>
                              );
                            })}
                          </div>
                          {feedback[qKey] !== undefined && (
                            <div
                              className={`mt-3 text-sm font-medium ${
                                feedback[qKey] ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              {feedback[qKey]
                                ? '✓ Correct! Well done.'
                                : `✗ Incorrect. The correct answer is: ${ex.answer}`}
                              {ex.explanation && (
                                <p className="text-gray-600 text-xs mt-1">{ex.explanation}</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {sessionMeta?.homework && (
        <section className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Session Homework & Audio Journal Task
          </h3>
          <p className="mt-2 text-sm text-slate-800">{sessionMeta.homework}</p>
        </section>
      )}
    </div>
  );
}

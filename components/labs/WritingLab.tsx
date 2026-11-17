'use client';

import React, { useState } from 'react';

export interface WritingScaffold {
  prompt?: string;
  targetKeywords?: string[];
}

export interface WritingLabProps {
  prompt?: string;
  targetKeywords?: string[];
  scaffold?: WritingScaffold;
  onSpeak?: (text: string) => void;
}

interface WritingFeedbackResponse {
  corrected?: string;
  feedback?: string;
  notes?: string[];
  score?: number;
}

export default function WritingLab({
  prompt,
  targetKeywords,
  scaffold,
  onSpeak,
}: WritingLabProps) {
  const activePrompt =
    prompt ??
    scaffold?.prompt ??
    'Write a short response using B1 British English vocabulary and structure.';

  const activeKeywords = targetKeywords ?? scaffold?.targetKeywords ?? [];

  const [text, setText] = useState('');
  const [result, setResult] = useState<WritingFeedbackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCheckWriting = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/writing/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          prompt: activePrompt,
          targetKeywords: activeKeywords,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to analyse your writing.');
        return;
      }

      setResult(data);
    } catch {
      setError('Network error while checking your writing. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            B1 British English Writing Lab
          </span>
          <p className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200">
            {activePrompt}
          </p>
        </div>

        {onSpeak && (
          <button
            type="button"
            onClick={() => onSpeak(activePrompt)}
            className="shrink-0 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700"
          >
            Listen
          </button>
        )}
      </div>

      {activeKeywords.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Target Vocabulary:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {activeKeywords.map((keyword) => (
              <span
                key={keyword}
                className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/70 dark:text-blue-300"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write your B1 British English response here..."
          className="w-full rounded-lg border border-gray-300 bg-transparent p-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:text-gray-100"
        />
        <div className="mt-1 flex justify-end text-xs text-gray-400">
          {text.trim().split(/\s+/).filter(Boolean).length} words
        </div>
      </div>

      <button
        type="button"
        onClick={handleCheckWriting}
        disabled={loading || !text.trim()}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Analysing British English...' : 'Check My Writing'}
      </button>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-800/60">
          {result.corrected && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  Suggested British English Version
                </span>
                {onSpeak && (
                  <button
                    type="button"
                    onClick={() => onSpeak(result.corrected!)}
                    className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Listen
                  </button>
                )}
              </div>
              <p className="rounded-md bg-white p-3 text-gray-800 dark:bg-zinc-900 dark:text-gray-200">
                {result.corrected}
              </p>
            </div>
          )}

          {result.feedback && (
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Examiner Feedback
              </span>
              <p className="mt-1 whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                {result.feedback}
              </p>
            </div>
          )}

          {Array.isArray(result.notes) && result.notes.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-gray-700 dark:text-gray-300">
              {result.notes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
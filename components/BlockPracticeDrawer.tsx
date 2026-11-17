'use client';

import React, { useState } from 'react';
import WritingLab from './labs/WritingLab';

export interface WritingScaffold {
  prompt?: string;
  targetKeywords?: string[];
}

export interface QuizData {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface BlockPracticeDrawerProps {
  isOpen?: boolean;
  onClose?: () => void;
  blockNumber?: number;
  scaffold?: WritingScaffold;
  onSpeak?: (text: string) => void;
  skillLabel?: string;
  scriptText?: string;
  quizData?: QuizData | null;
  targetDrillPhrase?: string;
  slowAudio?: boolean;
}

export default function BlockPracticeDrawer({
  isOpen = false,
  onClose = () => {},
  blockNumber = 1,
  scaffold = {},
  onSpeak = () => {},
  skillLabel,
  scriptText,
  quizData = null,
  targetDrillPhrase,
}: BlockPracticeDrawerProps) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
      <div className="relative h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl dark:bg-zinc-900">
        <div className="mb-6 flex items-start justify-between border-b border-gray-200 pb-4 dark:border-zinc-800">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              {skillLabel || 'Interactive Practice'}
            </span>
            <h2 className="mt-0.5 text-xl font-bold text-gray-900 dark:text-white">
              Practice Block {blockNumber}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close practice drawer"
            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-zinc-800 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6">
          {scriptText && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/70">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Reference Script
                </span>
                <button
                  type="button"
                  onClick={() => onSpeak(scriptText)}
                  className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-2xs hover:bg-gray-100 dark:bg-zinc-700 dark:text-gray-200 dark:hover:bg-zinc-600"
                >
                  Listen
                </button>
              </div>
              <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                {scriptText}
              </p>
            </div>
          )}

          {targetDrillPhrase && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-950/30">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                    Target Drill Phrase
                  </span>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                    “{targetDrillPhrase}”
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSpeak(targetDrillPhrase)}
                  className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Speak
                </button>
              </div>
            </div>
          )}

          {quizData && (
            <div className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-zinc-800">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Comprehension Check
              </span>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {quizData.question}
              </p>
              <div className="space-y-2">
                {quizData.options.map((option, idx) => {
                  const isSelected = selectedOption === idx;
                  const isCorrect = idx === quizData.correctIndex;
                  let buttonStyle =
                    'border-gray-200 hover:bg-gray-50 dark:border-zinc-700 dark:hover:bg-zinc-800';

                  if (selectedOption !== null) {
                    if (isCorrect) {
                      buttonStyle =
                        'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
                    } else if (isSelected) {
                      buttonStyle =
                        'border-red-500 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200';
                    }
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedOption(idx)}
                      className={`w-full rounded-lg border p-3 text-left text-sm transition ${buttonStyle}`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <WritingLab
            prompt={scaffold.prompt}
            targetKeywords={scaffold.targetKeywords}
            onSpeak={onSpeak}
          />
        </div>
      </div>
    </div>
  );
}
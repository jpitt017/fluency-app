'use client';

import React, { useState } from 'react';

interface Exercise {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

interface SessionBlock {
  id: string;
  block_number: number;
  title: string;
  start_minute: number;
  end_minute: number;
  description: string;
  content?: {
    exercises?: Exercise[];
  };
}

interface LessonViewerProps {
  sessionTitle: string;
  blocks: SessionBlock[];
}

export default function LessonViewer({ sessionTitle, blocks }: LessonViewerProps) {
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);
  
  // Track selected answers per block: { [blockIndex]: { [exerciseIndex]: selectedOption } }
  const [blockAnswers, setBlockAnswers] = useState<{ [blockIdx: number]: { [exIdx: number]: string } }>({});
  
  // Track revealed results per block: { [blockIndex]: { [exerciseIndex]: boolean } }
  const [blockResults, setBlockResults] = useState<{ [blockIdx: number]: { [exIdx: number]: boolean } }>({});
  
  // Track completed blocks
  const [completedBlocks, setCompletedBlocks] = useState<{ [blockIdx: number]: boolean }>({});

  if (!blocks || blocks.length === 0) {
    return (
      <div className="p-8 text-center bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <p className="text-gray-500 dark:text-gray-400">No lesson blocks available yet for this session.</p>
      </div>
    );
  }

  const currentBlock = blocks[activeBlockIndex] || blocks[0];
  const exercises = currentBlock.content?.exercises || [];

  const currentBlockAnswers = blockAnswers[activeBlockIndex] || {};
  const currentBlockResults = blockResults[activeBlockIndex] || {};

  const handleSelectOption = (exerciseIndex: number, option: string) => {
    setBlockAnswers({
      ...blockAnswers,
      [activeBlockIndex]: {
        ...currentBlockAnswers,
        [exerciseIndex]: option,
      },
    });
    setBlockResults({
      ...blockResults,
      [activeBlockIndex]: {
        ...currentBlockResults,
        [exerciseIndex]: true,
      },
    });
    setCompletedBlocks({
      ...completedBlocks,
      [activeBlockIndex]: true,
    });
  };

  // Calculate total score across all answered questions
  let totalCorrect = 0;
  let totalAnswered = 0;

  Object.keys(blockAnswers).forEach((bIdxKey) => {
    const bIdx = Number(bIdxKey);
    const ansMap = blockAnswers[bIdx];
    const blockExs = blocks[bIdx]?.content?.exercises || [];
    
    Object.keys(ansMap).forEach((exIdxKey) => {
      const exIdx = Number(exIdxKey);
      totalAnswered++;
      if (ansMap[exIdx] === blockExs[exIdx]?.correctAnswer) {
        totalCorrect++;
      }
    });
  });

  const allBlocksCompleted = Object.keys(completedBlocks).length === blocks.length;

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-gray-950 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800">
      {/* Header & Score Tracker Bar */}
      <div className="mb-8 border-b border-gray-100 dark:border-gray-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            British English RP Course
          </span>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{sessionTitle}</h1>
        </div>
        <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">Session Score:</div>
          <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
            {totalCorrect} / {totalAnswered} Correct ({totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0}%)
          </div>
        </div>
      </div>

      {/* Block Navigation Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {blocks.map((block, idx) => {
          const isActive = idx === activeBlockIndex;
          const isDone = completedBlocks[idx];
          return (
            <button
              key={block.id || idx}
              onClick={() => setActiveBlockIndex(idx)}
              className={`p-4 rounded-xl text-left transition-all border relative ${
                isActive
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20'
                  : 'bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <div className="flex justify-between items-center text-xs opacity-80 font-medium">
                <span>Block {block.block_number} • {block.start_minute}-{block.end_minute}m</span>
                {isDone && <span className="text-emerald-400 font-bold">✓</span>}
              </div>
              <div className="font-semibold text-sm mt-1 truncate">{block.title}</div>
            </button>
          );
        })}
      </div>

      {/* Active Block Content Panel */}
      <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {currentBlock.title}
          </h2>
          <span className="px-3 py-1 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold rounded-full">
            Minutes {currentBlock.start_minute} – {currentBlock.end_minute}
          </span>
        </div>

        <div className="prose dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line mb-6">
          {currentBlock.description}
        </div>

        {/* Exercises Section */}
        {exercises.length > 0 && (
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Practice & Comprehension Check
            </h3>
            <div className="space-y-6">
              {exercises.map((ex, exIdx) => {
                const userSelected = currentBlockAnswers[exIdx];
                const isAnswered = currentBlockResults[exIdx];
                const isCorrect = userSelected === ex.correctAnswer;

                return (
                  <div key={exIdx} className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                    <p className="font-medium text-gray-900 dark:text-white mb-3">
                      {exIdx + 1}. {ex.question}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                      {ex.options?.map((opt, optIdx) => {
                        let btnStyle = "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100";
                        if (isAnswered) {
                          if (opt === ex.correctAnswer) {
                            btnStyle = "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-500 font-semibold";
                          } else if (opt === userSelected) {
                            btnStyle = "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-500";
                          }
                        }

                        return (
                          <button
                            key={optIdx}
                            onClick={() => handleSelectOption(exIdx, opt)}
                            className={`p-3 rounded-lg text-left text-sm border transition-all ${btnStyle}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>

                    {isAnswered && (
                      <div className={`p-3 rounded-lg text-xs mt-3 ${isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'}`}>
                        <span className="font-bold">{isCorrect ? 'Correct! ' : 'Incorrect. '}</span>
                        {ex.explanation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Completion Banner */}
        {allBlocksCompleted && (
          <div className="mt-8 p-6 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center">
            <h4 className="text-lg font-bold text-emerald-800 dark:text-emerald-200 mb-1">Session Completed! 🎉</h4>
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              You have completed all blocks for this session with a final score of {totalCorrect} correct answers. Excellent progress on your British RP fluency!
            </p>
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="flex justify-between items-center pt-4 border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={() => setActiveBlockIndex((prev) => Math.max(prev - 1, 0))}
          disabled={activeBlockIndex === 0}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          Previous Block
        </button>
        <span className="text-sm text-gray-500">
          Block {activeBlockIndex + 1} of {blocks.length}
        </span>
        <button
          onClick={() => setActiveBlockIndex((prev) => Math.min(prev + 1, blocks.length - 1))}
          disabled={activeBlockIndex === blocks.length - 1}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-700"
        >
          Next Block
        </button>
      </div>
    </div>
  );
}

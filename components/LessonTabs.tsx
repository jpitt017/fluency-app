'use client';

import { useState } from 'react';
import { renderWithVocabularyTooltips } from '@/lib/vocabulary';

interface LessonBlock {
  number: number;
  window: string;
  type: string;
  title: string;
  focus: string;
  description: string;
  materials?: string[];
  procedure?: string[];
}

interface LessonTabsProps {
  blocks: LessonBlock[];
}

export default function LessonTabs({ blocks }: LessonTabsProps) {
  const [activeTab, setActiveTab] = useState(0);

  if (!blocks || blocks.length === 0) return null;

  const currentBlock = blocks[activeTab] || blocks[0];

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <h2 className="text-xl font-bold text-gray-900">📜 Session Script & Lesson Blocks</h2>
        <span className="text-xs font-mono bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200">
          {currentBlock.window}
        </span>
      </div>

      {/* Tab Navigation Buttons */}
      <div className="flex flex-wrap gap-2">
        {blocks.map((block, idx) => (
          <button
            key={block.number}
            onClick={() => setActiveTab(idx)}
            className={`px-4 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
              activeTab === idx
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Block {block.number}: {block.type}
          </button>
        ))}
      </div>

      {/* Active Block Content Card */}
      <div className="bg-gray-50/70 p-6 rounded-xl border border-gray-200 space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-xs font-bold uppercase rounded-full bg-blue-100 text-blue-800">
              {currentBlock.window} • {currentBlock.type}
            </span>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mt-2">{currentBlock.title}</h3>
          <p className="text-xs font-semibold text-blue-600">Focus: {currentBlock.focus}</p>
          
          {/* Description with Dynamic Vocabulary Tooltips */}
          <div className="text-sm text-gray-700 leading-relaxed mt-2">
            {renderWithVocabularyTooltips(currentBlock.description)}
          </div>
        </div>

        {currentBlock.procedure && currentBlock.procedure.length > 0 && (
          <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Procedure</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-800">
              {currentBlock.procedure.map((step, i) => (
                <li key={i} className="leading-relaxed">
                  {renderWithVocabularyTooltips(step)}
                </li>
              ))}
            </ol>
          </div>
        )}

        {currentBlock.materials && currentBlock.materials.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200">
            <span className="text-xs font-semibold text-gray-500">Required Materials:</span>
            {currentBlock.materials.map((mat, i) => (
              <span
                key={i}
                className="text-xs bg-white text-gray-700 border border-gray-200 px-3 py-1 rounded-md shadow-2xs"
              >
                {mat}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
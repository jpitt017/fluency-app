'use client';

import { useState } from 'react';

interface VocabularyTooltipProps {
  term: string;
  definition: string;
  example: string;
}

export default function VocabularyTooltip({ term, definition, example }: VocabularyTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span className="relative inline-block mx-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="text-blue-700 bg-blue-50 border-b border-dashed border-blue-400 font-semibold px-1.5 py-0.5 rounded hover:bg-blue-100 transition-colors cursor-help text-sm"
      >
        {term}
      </button>

      {isOpen && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-gray-900 text-white text-xs rounded-xl p-3 shadow-xl border border-gray-700 space-y-1.5 pointer-events-none">
          <p className="font-bold text-blue-300 uppercase tracking-wider text-[10px]">
            🇬🇧 British Lexis
          </p>
          <p className="text-gray-100 font-medium">{definition}</p>
          <p className="text-gray-400 italic text-[11px]">"{example}"</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </span>
  );
}
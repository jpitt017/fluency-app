'use client';

import { useState } from 'react';

interface WritingLabProps {
  sessionTitle?: string;
  keyLanguage?: string[];
  objectives?: string[];
  grammarFocus?: string;
}

export default function WritingLab({
  sessionTitle,
  keyLanguage = [],
  objectives = [],
  grammarFocus,
}: WritingLabProps) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ corrected?: string; notes?: string[] } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAnalyze() {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/writing/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          context: {
            sessionTitle,
            grammarFocus,
            keyLanguage,
            objectives,
          },
        }),
      });
      const data = await res.json();
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Contextual Target Banner */}
      {(grammarFocus || keyLanguage.length > 0) && (
        <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-3.5 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-800">
            🎯 Session Writing Targets
          </p>
          {grammarFocus && (
            <p className="text-xs text-gray-700">
              <span className="font-semibold">Focus:</span> {grammarFocus}
            </p>
          )}
          {keyLanguage.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {keyLanguage.map((item, idx) => (
                <span
                  key={idx}
                  className="text-xs bg-white text-blue-900 border border-blue-200 px-2.5 py-0.5 rounded-full"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <textarea
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a short paragraph applying this session's grammar and vocabulary..."
        className="w-full rounded-lg border border-gray-300 p-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
      />

      <button
        onClick={handleAnalyze}
        disabled={loading || !text.trim()}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Analysing...' : '✨ Correct Writing'}
      </button>

      {result && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3 text-sm">
          {result.corrected && (
            <div>
              <span className="font-semibold text-gray-900">B1 British English Version:</span>
              <p className="text-gray-800 mt-1">{result.corrected}</p>
            </div>
          )}
          {result.notes && result.notes.length > 0 && (
            <ul className="list-disc list-inside space-y-1 text-gray-700">
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

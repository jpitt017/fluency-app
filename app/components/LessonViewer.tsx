'use client';

import React from 'react';

interface Block {
  number: number;
  title: string;
  window: string;
  type: 'pronunciation' | 'language' | 'listening' | 'speaking';
  description: string;
  focus: string;
  procedure: string[];
  materials: string[];
}

interface LessonContent {
  version: number;
  summary: string;
  objectives: string[];
  blocks: Block[];
  key_language: string[];
  listening: {
    focus: string;
    texts: string[];
  };
  speaking: {
    focus: string;
    outcome: string;
  };
  homework: string;
  assessment: {
    formative: string[];
    criteria: string[];
  };
}

interface LessonViewerProps {
  title: string;
  notes?: string;
  content: LessonContent;
}

export default function LessonViewer({ title, notes, content }: LessonViewerProps) {
  // Color themes for the 4 core session blocks
  const blockColors = {
    pronunciation: 'border-blue-500 bg-blue-50/50 text-blue-900',
    language: 'border-emerald-500 bg-emerald-50/50 text-emerald-900',
    listening: 'border-amber-500 bg-amber-50/50 text-amber-900',
    speaking: 'border-purple-500 bg-purple-50/50 text-purple-900',
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8 bg-white shadow-sm rounded-xl border border-zinc-200 text-zinc-900">
      {/* Header */}
      <div className="border-b border-zinc-200 pb-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
          120-Minute British RP Session
        </span>
        <h1 className="text-3xl font-bold mt-3 text-zinc-900">{title}</h1>
        {notes && <p className="text-sm text-zinc-500 mt-1">{notes}</p>}
        <p className="text-zinc-700 mt-4 text-base leading-relaxed">{content.summary}</p>
      </div>

      {/* Objectives */}
      <div className="bg-zinc-50 p-5 rounded-lg border border-zinc-200">
        <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-700 mb-3">Core Learning Objectives</h3>
        <ul className="list-disc list-inside space-y-1.5 text-sm text-zinc-800">
          {content.objectives.map((obj, idx) => (
            <li key={idx}>{obj}</li>
          ))}
        </ul>
      </div>

      {/* The 4 Session Blocks */}
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-zinc-900">Session Curriculum Blocks</h2>
        {content.blocks.map((block) => (
          <div
            key={block.number}
            className={`border-l-4 p-6 rounded-r-lg border border-zinc-200 ${blockColors[block.type] || 'border-zinc-400 bg-zinc-50'}`}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold uppercase tracking-wider opacity-75">
                Block {block.number} • {block.window}
              </span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-white shadow-xs uppercase">
                {block.type}
              </span>
            </div>
            <h3 className="text-lg font-bold mb-1">{block.title}</h3>
            <p className="text-sm opacity-95 mb-4">{block.description}</p>
            
            <div className="grid md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-black/10">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider mb-2 opacity-75">Procedure</h4>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  {block.procedure.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider mb-2 opacity-75">Materials & Focus</h4>
                <p className="text-sm mb-2"><strong className="font-medium">Focus:</strong> {block.focus}</p>
                <div className="flex flex-wrap gap-1.5">
                  {block.materials.map((mat, idx) => (
                    <span key={idx} className="text-xs bg-white/80 border border-black/10 px-2 py-0.5 rounded">
                      {mat}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Key Language & Speaking Outcomes */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-zinc-50 p-5 rounded-lg border border-zinc-200">
          <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-700 mb-3">Key Language & Phrases</h3>
          <ul className="space-y-1.5 text-sm text-zinc-800">
            {content.key_language.map((lang, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-600"></span>
                {lang}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-zinc-50 p-5 rounded-lg border border-zinc-200">
          <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-700 mb-3">Speaking Outcome</h3>
          <p className="text-sm text-zinc-800 font-medium mb-3">{content.speaking.focus}</p>
          <p className="text-xs text-zinc-600 bg-white p-3 rounded border border-zinc-200">
            <strong>Target Outcome:</strong> {content.speaking.outcome}
          </p>
        </div>
      </div>

      {/* Homework & Assessment */}
      <div className="border-t border-zinc-200 pt-6 space-y-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-700 mb-1">Homework Task</h3>
          <p className="text-sm text-zinc-800 bg-zinc-50 p-4 rounded-lg border border-zinc-200">{content.homework}</p>
        </div>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-700 mb-2">Formative Assessment Criteria</h3>
          <div className="flex flex-wrap gap-2">
            {content.assessment.criteria.map((criterion, idx) => (
              <span key={idx} className="text-xs bg-indigo-50 text-indigo-900 border border-indigo-200 px-3 py-1 rounded-full font-medium">
                {criterion}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

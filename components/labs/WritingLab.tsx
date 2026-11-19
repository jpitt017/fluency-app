'use client';

import { useState } from 'react';
import type { LessonLabContext } from './LessonLabContext';

export interface WritingScaffold { prompt?: string; targetKeywords?: string[] }
export interface WritingLabProps {
  prompt?: string;
  targetKeywords?: string[];
  scaffold?: WritingScaffold;
  onSpeak?: (text: string) => void;
  lessonContext?: LessonLabContext;
}
interface WritingFeedbackResponse {
  corrected?: string;
  feedback?: string;
  notes?: string[];
  score?: number;
  passed?: boolean;
  rubric?: Record<string, unknown>;
}

export default function WritingLab({ prompt, targetKeywords, scaffold, onSpeak, lessonContext }: WritingLabProps) {
  const activePrompt = lessonContext?.prompt ?? prompt ?? scaffold?.prompt ?? 'Write a short response using B1 British English vocabulary and structure.';
  const activeKeywords = lessonContext?.targetVocabulary ?? targetKeywords ?? scaffold?.targetKeywords ?? [];
  const [text, setText] = useState('');
  const [result, setResult] = useState<WritingFeedbackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const isCheckpoint = lessonContext?.mode === 'checkpoint' && lessonContext.cefrSkill === 'Writing';
  const minWords = lessonContext?.minWords ?? (isCheckpoint ? 100 : 1);
  const maxWords = lessonContext?.maxWords ?? (isCheckpoint ? 130 : 1500);

  async function handleCheckWriting() {
    if (!text.trim()) return;
    if (lessonContext?.mode === 'checkpoint' && (wordCount < minWords || wordCount > maxWords)) {
      setError(`Write between ${minWords} and ${maxWords} words for this checkpoint.`);
      return;
    }
    setLoading(true); setError(null); setResult(null);
    try {
      const target = lessonContext;
      const response = await fetch(isCheckpoint ? '/api/checkpoints/writing' : '/api/writing/correct', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isCheckpoint && target?.moduleId && target.cefrSkill ? {
          moduleNumber: target.moduleId,
          objectiveId: `B1_M${target.moduleId}_WR`,
          writing: text,
        } : {
          text,
          prompt: `${activePrompt}${target?.targetGrammar?.length ? ` Target grammar: ${target.targetGrammar.join(', ')}.` : ''}`,
          targetKeywords: activeKeywords,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to analyse your writing.');
      setResult(data);
      lessonContext?.onComplete?.({ text, score: data.score, passed: data.passed, rubric: data.rubric });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Network error while checking your writing. Please try again.');
    } finally { setLoading(false); }
  }

  return <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
    <div className="flex items-start justify-between gap-3"><div><span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">B1 British English Writing Lab{lessonContext?.mode === 'checkpoint' ? ' · Checkpoint' : lessonContext?.mode === 'drill' ? ' · Lesson drill' : ' · Free practice'}</span><p className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200">{activePrompt}</p></div>{onSpeak && <button type="button" onClick={() => onSpeak(activePrompt)} className="shrink-0 rounded-lg border px-3 py-1.5 text-xs">Listen</button>}</div>
    {lessonContext?.targetGrammar?.length ? <div><p className="text-xs font-medium text-gray-500">Target grammar</p><div className="mt-1 flex flex-wrap gap-1.5">{lessonContext.targetGrammar.map((item) => <span key={item} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700">{item}</span>)}</div></div> : null}
    {activeKeywords.length > 0 && <div><p className="text-xs font-medium text-gray-500">Target vocabulary</p><div className="mt-1 flex flex-wrap gap-1.5">{activeKeywords.map((keyword) => <span key={keyword} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{keyword}</span>)}</div></div>}
    <div><textarea rows={5} value={text} onChange={(event) => setText(event.target.value)} placeholder={isCheckpoint ? `Write ${minWords}–${maxWords} words in British English…` : 'Write your B1 British English response here…'} className="w-full rounded-lg border border-gray-300 bg-transparent p-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"/><div className="mt-1 flex justify-between text-xs text-gray-400"><span>{isCheckpoint ? `Target: ${minWords}–${maxWords} words` : 'British English'}</span><span>{wordCount} words</span></div></div>
    <button type="button" onClick={handleCheckWriting} disabled={loading || !text.trim()} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{loading ? 'Analysing British English…' : isCheckpoint ? 'Submit writing checkpoint' : 'Check my writing'}</button>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {result && <div role="status" className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-800/60">
      {typeof result.passed === 'boolean' && <p className={result.passed ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>{result.passed ? 'Can-Do checkpoint passed' : 'Review your feedback and try again'}{typeof result.score === 'number' ? ` · ${result.score}%` : ''}</p>}
      {result.corrected && <div><div className="mb-1 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Suggested British English version</span>{onSpeak && <button type="button" onClick={() => onSpeak(result.corrected!)} className="text-xs text-blue-600">Listen</button>}</div><p className="rounded-md bg-white p-3 text-gray-800">{result.corrected}</p></div>}
      {result.feedback && <div><span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Feedback</span><p className="mt-1 whitespace-pre-wrap text-gray-700">{result.feedback}</p></div>}
      {Array.isArray(result.notes) && result.notes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-gray-700">{result.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
      {result.rubric && <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-slate-600">{JSON.stringify(result.rubric, null, 2)}</pre>}
    </div>}
  </div>;
}

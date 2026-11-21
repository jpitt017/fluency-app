'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BookOpen, Layers, Link2, Sparkles, Volume2 } from 'lucide-react';
import { playAudioOrSpeak } from '@/lib/b1b2/speech';
import type { LessonVocabItem, VocabPack } from '@/lib/b1b2/types';

interface SentenceFeedback {
  corrected: string;
  feedback: string;
  score: number;
}

export default function MondayVocabPack({
  vocabItems,
  vocabPack,
  signedIn,
  lessonNumber,
}: {
  vocabItems: LessonVocabItem[];
  vocabPack?: VocabPack | null;
  signedIn: boolean;
  lessonNumber: number;
}) {
  const [accent, setAccent] = useState<'en-GB' | 'en-US'>('en-GB');
  const [showTranslations, setShowTranslations] = useState(false);
  const [openPrompts, setOpenPrompts] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [feedbackById, setFeedbackById] = useState<Record<string, SentenceFeedback>>({});
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  const collocations = vocabPack?.collocations ?? [];
  const wordFamilies = vocabPack?.wordFamilies ?? [];
  const linkingExpressions = vocabPack?.linkingExpressions ?? [];

  async function checkSentence(item: LessonVocabItem) {
    const draft = (drafts[item.id] ?? '').trim();
    if (!draft) return;

    setCheckingId(item.id);
    setErrorById((prev) => ({ ...prev, [item.id]: '' }));

    try {
      const response = await fetch('/api/writing/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: draft,
          prompt: `${item.sentence_prompt ?? `Write a natural B1->B2 sentence using "${item.term}".`} Target expression: "${item.term}" (${item.definition}).`,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        corrected?: string;
        feedback?: string;
        score?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? 'Could not check your sentence right now.');
      }
      setFeedbackById((prev) => ({
        ...prev,
        [item.id]: {
          corrected: data.corrected ?? draft,
          feedback: data.feedback ?? '',
          score: data.score ?? 80,
        },
      }));
    } catch (caught) {
      setErrorById((prev) => ({
        ...prev,
        [item.id]: caught instanceof Error ? caught.message : 'Could not check your sentence right now.',
      }));
    } finally {
      setCheckingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-stone-700">
          <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-stone-200">
            1. {vocabItems.length} core expressions
          </span>
          {collocations.length > 0 && (
            <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-stone-200">
              2. {collocations.length} collocations
            </span>
          )}
          {wordFamilies.length > 0 && (
            <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-stone-200">
              3. {wordFamilies.length} word families
            </span>
          )}
          {linkingExpressions.length > 0 && (
            <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-stone-200">
              4. {linkingExpressions.length} linking expressions
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTranslations((v) => !v)}
            className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-100"
          >
            {showTranslations ? 'Hide ES gloss' : 'Show ES gloss'}
          </button>
          <div className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setAccent('en-GB')}
              className={`rounded-md px-2 py-0.5 ${accent === 'en-GB' ? 'bg-indigo-700 text-white' : 'text-stone-600'}`}
            >
              UK Audio
            </button>
            <button
              type="button"
              onClick={() => setAccent('en-US')}
              className={`rounded-md px-2 py-0.5 ${accent === 'en-US' ? 'bg-indigo-700 text-white' : 'text-stone-600'}`}
            >
              US Audio
            </button>
          </div>
        </div>
      </div>

      {/* Part 1: Core Vocabulary */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-700" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-stone-700">
            Part 1 · Core Vocabulary ({vocabItems.length} expressions)
          </h3>
        </div>

        <div className="grid gap-3.5 md:grid-cols-2">
          {vocabItems.map((item, idx) => {
            const promptOpen = Boolean(openPrompts[item.id]);
            const fb = feedbackById[item.id];
            const err = errorById[item.id];

            return (
              <article
                key={item.id}
                className="flex flex-col justify-between rounded-xl border border-stone-200 bg-white p-4 shadow-2xs"
              >
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold text-indigo-700">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <h4 className="text-base font-bold text-stone-900">{item.term}</h4>
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                          {item.part_of_speech}
                        </span>
                        {item.band && (
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-800">
                            {item.band}
                          </span>
                        )}
                      </div>
                      {item.ipa && <p className="mt-0.5 text-xs text-stone-500">{item.ipa}</p>}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        void playAudioOrSpeak(item.audio_url, item.example || item.term, accent, 0.95)
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                    >
                      <Volume2 className="h-3.5 w-3.5 text-indigo-700" />
                      <span>{item.audio_url ? 'Studio audio' : accent === 'en-GB' ? 'Listen (UK)' : 'Listen (US)'}</span>
                    </button>
                  </div>

                  <p className="mt-2.5 text-sm leading-5 text-stone-800">{item.definition}</p>
                  <p className="mt-1.5 rounded-lg bg-stone-50 px-3 py-2 text-xs italic leading-5 text-stone-700">
                    &ldquo;{item.example}&rdquo;
                  </p>

                  {item.collocations.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {item.collocations.map((col) => (
                        <span
                          key={col}
                          className="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-900 ring-1 ring-sky-200/70"
                        >
                          {col}
                        </span>
                      ))}
                    </div>
                  )}

                  {item.word_family && item.word_family.length > 1 && (
                    <p className="mt-2 text-[11px] text-stone-600">
                      <span className="font-semibold text-stone-700">Family:</span>{' '}
                      {item.word_family.join(' · ')}
                    </p>
                  )}

                  {item.usage_note && (
                    <p className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50/70 px-2.5 py-1.5 text-[11px] leading-4 text-amber-950">
                      <span className="font-semibold">Note:</span> {item.usage_note}
                    </p>
                  )}

                  {showTranslations && item.translation_es && (
                    <p className="mt-2 text-[11px] font-medium text-stone-500">ES: {item.translation_es}</p>
                  )}
                </div>

                {item.sentence_prompt && (
                  <div className="mt-3 border-t border-stone-100 pt-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenPrompts((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                      }
                      className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                    >
                      {promptOpen ? 'Hide sentence prompt' : 'Make your own sentence →'}
                    </button>

                    {promptOpen && (
                      <div className="mt-2 space-y-2 rounded-lg bg-indigo-50/50 p-2.5 ring-1 ring-indigo-200/70">
                        <p className="text-xs text-stone-700">{item.sentence_prompt}</p>
                        {signedIn ? (
                          <>
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <input
                                type="text"
                                value={drafts[item.id] ?? ''}
                                onChange={(e) =>
                                  setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                                }
                                placeholder={`Write a sentence using "${item.term}"…`}
                                className="flex-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-900 focus:border-indigo-500 focus:outline-none"
                              />
                              <button
                                type="button"
                                disabled={checkingId === item.id || !(drafts[item.id] ?? '').trim()}
                                onClick={() => void checkSentence(item)}
                                className="shrink-0 rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-800 disabled:bg-stone-300"
                              >
                                {checkingId === item.id ? 'Checking…' : 'Check'}
                              </button>
                            </div>
                            {err && <p className="text-[11px] text-rose-700">{err}</p>}
                            {fb && (
                              <div className="space-y-1 rounded-md bg-white p-2 text-[11px] ring-1 ring-indigo-200">
                                <p className="font-semibold text-indigo-950">
                                  Phrasing ({fb.score}/100):{' '}
                                  <span className="font-normal text-stone-800">{fb.corrected}</span>
                                </p>
                                {fb.feedback && <p className="text-stone-600">{fb.feedback}</p>}
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-[11px] text-stone-600">
                            <Link
                              href={`/login?next=/curriculum/lessons/${lessonNumber}`}
                              className="font-semibold text-indigo-700 underline"
                            >
                              Sign in
                            </Link>{' '}
                            to get instant AI feedback on your sentence.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {/* Part 2: Collocations & Phrasal Expressions */}
      {collocations.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-700" />
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-700">
              Part 2 · Collocations &amp; Phrasal Expressions
            </h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {collocations.map((col) => (
              <div
                key={col.phrase}
                className="rounded-xl border border-stone-200 bg-stone-50/60 p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-stone-900">{col.phrase}</p>
                  <button
                    type="button"
                    onClick={() => void playAudioOrSpeak(null, col.example, accent, 0.95)}
                    className="shrink-0 rounded-md border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-stone-600 hover:bg-stone-100"
                  >
                    Listen
                  </button>
                </div>
                <p className="mt-1.5 text-xs italic leading-5 text-stone-700">&ldquo;{col.example}&rdquo;</p>
                {col.note && <p className="mt-1 text-[11px] text-stone-600">{col.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Part 3: Word Families */}
      {wordFamilies.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Layers className="h-4 w-4 text-indigo-700" />
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-700">
              Part 3 · Word Families
            </h3>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {wordFamilies.map((wf) => (
              <div key={wf.base} className="rounded-xl border border-stone-200 bg-white p-3.5">
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">
                  Base: {wf.base}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {wf.forms.map((form) => (
                    <span
                      key={form}
                      className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-900"
                    >
                      {form}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs italic leading-5 text-stone-700">&ldquo;{wf.example}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Part 4: Useful Linking Expressions */}
      {linkingExpressions.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-indigo-700" />
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-700">
              Part 4 · Useful Linking Expressions
            </h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {linkingExpressions.map((linker) => (
              <div key={linker.expression} className="rounded-xl border border-stone-200 bg-white p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900 ring-1 ring-emerald-200">
                    {linker.functionLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => void playAudioOrSpeak(null, linker.example, accent, 0.95)}
                    className="rounded-md border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-semibold text-stone-600 hover:bg-stone-100"
                  >
                    Listen
                  </button>
                </div>
                <p className="mt-2 text-sm font-semibold text-stone-900">{linker.expression}</p>
                <p className="mt-1 text-xs italic leading-5 text-stone-600">&ldquo;{linker.example}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

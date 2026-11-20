'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { VocabDeckSummary } from '@/lib/b1b2/types';

interface DueCard {
  card_id: string;
  deck_id?: string;
  term: string;
  part_of_speech: string | null;
  ipa: string | null;
  definition: string | null;
  example: string | null;
  collocations: string[] | null;
  translation_es: string | null;
  ladder_step: number;
}

const GRADES = [
  { grade: 'again', label: 'Again', hint: '1 day' },
  { grade: 'hard', label: 'Hard', hint: 'Shorten' },
  { grade: 'good', label: 'Good', hint: 'Advance' },
  { grade: 'easy', label: 'Easy', hint: 'Jump +2' },
] as const;

export default function VocabReviewStudio({
  decks,
  signedIn,
  dueCount,
  totalReviews,
}: {
  decks: VocabDeckSummary[];
  signedIn: boolean;
  dueCount: number;
  totalReviews: number;
}) {
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [queue, setQueue] = useState<DueCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [browsingDeckId, setBrowsingDeckId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  const totalCards = useMemo(() => decks.reduce((sum, d) => sum + d.items.length, 0), [decks]);

  async function startQueue(deckId: string | null = null) {
    if (!signedIn) return;
    setBusy(true);
    setError('');
    setSelectedDeckId(deckId);
    try {
      await supabase.rpc('ensure_vocab_cards');

      if (!deckId) {
        const { data, error: dueError } = await supabase.rpc('get_due_cards', { p_limit: 25 });
        if (dueError) throw dueError;
        setQueue((data as DueCard[] | null) ?? []);
      } else {
        const nowIso = new Date().toISOString();
        const { data, error: cardError } = await supabase
          .from('vocab_cards')
          .select(
            'id, ladder_step, vocab_items!inner(id, deck_id, term, part_of_speech, ipa, definition, example, collocations, translation_es)',
          )
          .eq('vocab_items.deck_id', deckId)
          .lte('due_at', nowIso)
          .order('due_at', { ascending: true })
          .limit(25);

        if (cardError) throw cardError;

        const mapped: DueCard[] = (data ?? []).map((row) => {
          const item = (Array.isArray(row.vocab_items) ? row.vocab_items[0] : row.vocab_items) as unknown as {
            deck_id: string;
            term: string;
            part_of_speech: string | null;
            ipa: string | null;
            definition: string | null;
            example: string | null;
            collocations: string[] | null;
            translation_es: string | null;
          };
          return {
            card_id: String(row.id),
            deck_id: item.deck_id,
            term: item.term,
            part_of_speech: item.part_of_speech,
            ipa: item.ipa,
            definition: item.definition,
            example: item.example,
            collocations: item.collocations,
            translation_es: item.translation_es,
            ladder_step: Number(row.ladder_step ?? 0),
          };
        });
        setQueue(mapped);
      }

      setIndex(0);
      setReviewed(0);
      setRevealed(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load due vocabulary cards.');
    } finally {
      setBusy(false);
    }
  }

  async function gradeCard(grade: (typeof GRADES)[number]['grade']) {
    if (!queue || !queue[index]) return;
    setBusy(true);
    setError('');
    try {
      const { error: reviewError } = await supabase.rpc('review_vocab_card', {
        p_card_id: queue[index].card_id,
        p_grade: grade,
      });
      if (reviewError) throw reviewError;
      setReviewed((n) => n + 1);
      setIndex((i) => i + 1);
      setRevealed(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save review.');
    } finally {
      setBusy(false);
    }
  }

  const activeDeckTitle = selectedDeckId
    ? decks.find((d) => d.id === selectedDeckId)?.title ?? 'Selected deck'
    : 'All due cards';

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
              Spaced Repetition (1 → 3 → 7 → 14 → 30 → 60 days)
            </p>
            <h2 className="mt-1 font-serif text-2xl font-bold text-stone-900">Daily Review Queue</h2>
            <p className="mt-1 text-sm text-stone-600">
              {totalCards} lexical items across {decks.length} module decks
              {signedIn ? ` · ${dueCount} due now · ${totalReviews + reviewed} reviews logged` : ''}.
            </p>
          </div>
          {signedIn ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => startQueue(null)}
              className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:bg-stone-300"
            >
              {busy ? 'Loading queue…' : dueCount > 0 ? `Review due cards (${dueCount})` : 'Sync & check due cards'}
            </button>
          ) : (
            <Link
              href="/login?next=/vocabulary"
              className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-800"
            >
              Sign in to track SRS
            </Link>
          )}
        </div>

        {error && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}

        {queue !== null && (
          <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-5">
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span className="font-semibold uppercase tracking-wide text-indigo-700">{activeDeckTitle}</span>
              {queue.length > 0 && index < queue.length && (
                <span>
                  Card {index + 1} / {queue.length} · Ladder step {queue[index].ladder_step}
                </span>
              )}
            </div>

            {queue.length === 0 ? (
              <p className="mt-3 text-sm font-medium text-emerald-800">
                No cards are due in {activeDeckTitle.toLowerCase()} right now. Browse any deck below or return tomorrow.
              </p>
            ) : index >= queue.length ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-emerald-800">Session complete — {reviewed} cards reviewed.</p>
                <button
                  type="button"
                  onClick={() => startQueue(selectedDeckId)}
                  className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                >
                  Check queue again
                </button>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-stone-200 bg-white p-5">
                <p className="text-2xl font-bold text-stone-900">{queue[index].term}</p>
                <p className="mt-1 text-xs text-stone-500">
                  {queue[index].part_of_speech ?? 'lexical item'}
                  {queue[index].ipa ? ` · ${queue[index].ipa}` : ''}
                </p>

                {revealed ? (
                  <div className="mt-4 space-y-2 rounded-xl bg-stone-50 p-4 text-sm text-stone-800">
                    {queue[index].definition && <p>{queue[index].definition}</p>}
                    {queue[index].example && <p className="italic text-stone-600">&ldquo;{queue[index].example}&rdquo;</p>}
                    {queue[index].collocations?.length ? (
                      <p className="text-xs text-stone-600">
                        <strong className="text-stone-700">Collocations:</strong> {queue[index].collocations?.join(' · ')}
                      </p>
                    ) : null}
                    {queue[index].translation_es && (
                      <p className="text-xs text-stone-500">ES: {queue[index].translation_es}</p>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRevealed(true)}
                    className="mt-4 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50"
                  >
                    Reveal definition &amp; collocations
                  </button>
                )}

                {revealed && (
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {GRADES.map((g) => (
                      <button
                        key={g.grade}
                        type="button"
                        disabled={busy}
                        onClick={() => gradeCard(g.grade)}
                        className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-xs font-semibold text-stone-800 transition hover:border-indigo-500 hover:bg-indigo-50 disabled:opacity-50"
                      >
                        {g.label}
                        <span className="mt-0.5 block text-[10px] font-normal text-stone-500">{g.hint}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-serif text-xl font-bold text-stone-900">Topic Decks (Modules 1–8)</h2>
          <span className="text-xs text-stone-500">Inspect collocations, IPA, and examples or practice due cards</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {decks.map((deck) => {
            const isOpen = browsingDeckId === deck.id;

            return (
              <div key={deck.id} className="rounded-2xl border border-stone-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                      {deck.module_number ? `Module ${deck.module_number}` : deck.topic}
                    </span>
                    <h3 className="mt-0.5 text-base font-bold text-stone-900">{deck.title}</h3>
                    {deck.description && <p className="mt-1 text-xs leading-5 text-stone-600">{deck.description}</p>}
                  </div>
                  <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
                    {deck.items.length} cards
                  </span>
                </div>

                <p className="mt-3 text-xs text-stone-500">
                  Topic: {deck.topic} · Daily target: {deck.daily_target} cards/day
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {signedIn && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => startQueue(deck.id)}
                      className="rounded-xl bg-stone-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-stone-800 disabled:bg-stone-300"
                    >
                      Practice deck
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setBrowsingDeckId(isOpen ? null : deck.id)}
                    className="rounded-xl border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
                  >
                    {isOpen ? 'Hide word list' : `Browse ${deck.items.length} words`}
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-4 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-3">
                    {deck.items.map((item) => (
                      <div key={item.id} className="rounded-lg bg-white p-2.5 text-xs ring-1 ring-stone-200/80">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-bold text-stone-900">
                            {item.term}{' '}
                            {item.ipa && <span className="font-normal text-stone-500">{item.ipa}</span>}
                          </span>
                          <span className="text-[10px] font-semibold uppercase text-indigo-700">{item.band}</span>
                        </div>
                        <p className="mt-1 text-stone-700">{item.definition}</p>
                        <p className="mt-0.5 italic text-stone-500">{item.example}</p>
                        {item.collocations.length > 0 && (
                          <p className="mt-1 text-[11px] text-stone-500">Collocations: {item.collocations.join(' · ')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

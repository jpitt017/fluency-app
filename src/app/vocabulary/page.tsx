import Link from 'next/link';
import VocabReviewStudio from '@/components/b1b2/VocabReviewStudio';
import { loadVocabDecks } from '@/lib/b1b2/data';

export const dynamic = 'force-dynamic';

export default async function VocabularyPage() {
  const { decks, signedIn, dueCount, totalReviews } = await loadVocabDecks();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Lexical Lab · SRS</p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-stone-900">Vocabulary Studio</h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">
            Review B1 → B2 collocations, phrasal verbs, and academic discourse markers across all 8 module decks.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
        >
          Back to dashboard
        </Link>
      </div>

      <VocabReviewStudio decks={decks} signedIn={signedIn} dueCount={dueCount} totalReviews={totalReviews} />
    </main>
  );
}

import Link from 'next/link';
import WarmUpDeck from '@/components/b1b2/WarmUpDeck';
import { getViewer } from '@/lib/b1b2/data';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Vocabulary review',
};

export default async function ReviewPage() {
  const viewer = await getViewer();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-slate-500">
        <Link href="/curriculum" className="font-semibold text-indigo-700 hover:underline">
          Curriculum
        </Link>
        <span aria-hidden> / </span>
        <span>Review</span>
      </nav>

      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Vocabulary review</h1>
        <p className="mt-1 text-sm text-slate-600">
          Everything the scheduler says is due, across all eight decks. Grades move a card along the 1 → 3 → 7 → 14 → 30 → 60 day ladder.
        </p>
      </header>

      <WarmUpDeck signedIn={viewer.signedIn} limit={20} cardCount={20} reviewLadderDays={[1, 3, 7, 14, 30, 60]} />

      <p className="mt-6 text-xs text-slate-500">
        New cards are added from the lesson you are studying — each lesson seeds its own 8–12 item window.
      </p>
    </main>
  );
}

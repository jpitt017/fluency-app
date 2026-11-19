import Link from 'next/link';
import { getViewer, loadOutline } from '@/lib/b1b2/data';
import CurriculumOverview from '../CurriculumOverview';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Curriculum · English B1 → B2',
};

export default async function CurriculumPage() {
  const [outline, viewer] = await Promise.all([loadOutline(), getViewer()]);

  if (!outline || !outline.course) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-bold text-slate-900">Curriculum unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">
          We could not load the course outline. Check the Supabase connection, then refresh this page.
        </p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700">
          Back to home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <CurriculumOverview outline={outline} signedIn={viewer.signedIn} />
    </main>
  );
}

import Link from 'next/link';
import GrammarClinicClient from '@/components/b1b2/GrammarClinicClient';
import { loadDashboard } from '@/lib/b1b2/data';
import { findClinicTopicsForErrors, GRAMMAR_CLINIC_TOPICS } from '@/lib/b1b2/grammar-clinic';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Grammar Clinic · English B1 → B2',
};

export default async function GrammarClinicPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const [{ topic }, dash] = await Promise.all([searchParams, loadDashboard()]);
  const errorCategories = dash.telemetry.recurringErrors.map((e) => e.tag);
  const matchedTopics = findClinicTopicsForErrors(errorCategories);
  const recommendedSlugs = matchedTopics.map((t) => t.slug);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
              B1 Foundation Repair · Linked from Week 1
            </span>
            <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight text-stone-900">
              Grammar Clinic
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-stone-600">
              Clean up recurring B1 slips across present simple/continuous, articles, quantifiers, prepositions, subject–verb agreement, and verb forms whenever your feedback flags them.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/review"
              className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-50"
            >
              Error-log queue →
            </Link>
            <Link
              href="/curriculum"
              className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-800"
            >
              16-week syllabus
            </Link>
          </div>
        </div>
      </header>

      <GrammarClinicClient
        topics={GRAMMAR_CLINIC_TOPICS}
        recommendedSlugs={recommendedSlugs}
        initialSlug={topic ?? null}
      />
    </main>
  );
}

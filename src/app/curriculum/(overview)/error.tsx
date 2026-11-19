'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function CurriculumError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Curriculum route error:', error.message);
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-bold text-slate-900">The curriculum could not load</h1>
      <p className="mt-2 text-sm text-slate-600">
        That is usually a Supabase connection problem. Your progress is safe — try again, and if it keeps failing check the
        project URL and anon key in the deployment environment.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700"
        >
          Try again
        </button>
        <Link href="/" className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Back to home
        </Link>
      </div>
    </main>
  );
}

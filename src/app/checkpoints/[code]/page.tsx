import Link from 'next/link';
import { notFound } from 'next/navigation';
import CheckpointRunner from '@/components/b1b2/CheckpointRunner';
import { loadCheckpointDetail } from '@/lib/b1b2/data';

export const dynamic = 'force-dynamic';

export default async function CheckpointDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { signedIn, checkpoint } = await loadCheckpointDetail(code.toUpperCase());

  if (!checkpoint) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/checkpoints" className="text-xs font-semibold text-indigo-700 hover:underline">
            ← All checkpoints
          </Link>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-stone-900">{checkpoint.title}</h1>
          {checkpoint.module && (
            <p className="mt-1 text-sm text-stone-600">
              Module {checkpoint.module.module_number} · {checkpoint.module.title}
            </p>
          )}
        </div>
        <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-700">
          {checkpoint.duration_minutes} minutes · Pass 70%
        </span>
      </div>

      <CheckpointRunner checkpoint={checkpoint} signedIn={signedIn} />
    </main>
  );
}

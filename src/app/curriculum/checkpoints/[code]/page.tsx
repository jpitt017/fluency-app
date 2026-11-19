import Link from 'next/link';
import { notFound } from 'next/navigation';
import CheckpointRunner from '@/components/b1b2/CheckpointRunner';
import { getViewer, loadCheckpoint } from '@/lib/b1b2/data';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const payload = await loadCheckpoint(code);
  return { title: payload ? `${payload.checkpoint.title} · checkpoint` : 'Checkpoint' };
}

export default async function CheckpointPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [payload, viewer] = await Promise.all([loadCheckpoint(code), getViewer()]);
  if (!payload) notFound();

  const { checkpoint, module, attempt } = payload;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        <Link href="/curriculum" className="font-semibold text-indigo-700 hover:underline">
          Curriculum
        </Link>
        <span aria-hidden>/</span>
        <span>{checkpoint.timing_label}</span>
      </nav>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-slate-900 px-2.5 py-1 text-white">Checkpoint</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{checkpoint.duration_minutes} min</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{checkpoint.timing_label}</span>
          {attempt?.result?.band && (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">Last result: {attempt.result.band.replace(/_/g, ' ')}</span>
          )}
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{checkpoint.title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{checkpoint.description}</p>
        {module && <p className="mt-2 text-xs text-slate-500">Covers modules 1–{module.number} · {module.title}</p>}

        <ul className="mt-4 grid gap-2 sm:grid-cols-3">
          {checkpoint.tasks?.map((task) => (
            <li key={task.title} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">{task.kind}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{task.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{task.detail}</p>
              <p className="mt-1 text-[11px] text-slate-400">~{task.minutes} min</p>
            </li>
          ))}
        </ul>
      </header>

      <CheckpointRunner payload={payload} signedIn={viewer.signedIn} />
    </main>
  );
}

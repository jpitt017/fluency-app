export default function CurriculumLoading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10" aria-busy="true" aria-label="Loading curriculum">
      <div className="h-6 w-40 animate-pulse rounded-full bg-slate-200" />
      <div className="mt-3 h-9 w-2/3 animate-pulse rounded-lg bg-slate-200" />
      <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-slate-100" />
      <div className="mt-6 h-20 animate-pulse rounded-2xl bg-slate-100" />
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="h-56 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-56 animate-pulse rounded-2xl bg-slate-100" />
      </div>
      <div className="mt-6 space-y-4">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    </main>
  );
}

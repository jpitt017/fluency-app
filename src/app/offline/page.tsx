import Link from 'next/link';

export const metadata = { title: 'Offline · Fluency Studio' };

/**
 * Public offline page. This is the only HTML the service worker precaches, so it
 * must stay static, signed-out friendly and free of learner data.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-140px)] max-w-xl items-center justify-center px-4 py-12">
      <div className="w-full space-y-4 rounded-2xl border border-stone-200 bg-white p-8 text-center">
        <h1 className="text-xl font-bold text-stone-900">You are offline</h1>
        <p className="text-sm leading-6 text-stone-700">
          Pages you already opened are still here. New lessons and AI feedback need a
          connection, so they will work again when you are back online.
        </p>
        <p className="text-xs text-stone-500">
          Your answers are saved in this browser and sent when you reconnect.
        </p>
        <Link
          href="/dashboard"
          className="inline-block rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Try again
        </Link>
      </div>
    </main>
  );
}

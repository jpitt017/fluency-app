import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import AppHeader from '@/components/b1b2/AppHeader';
import { loadHeaderSummary } from '@/lib/b1b2/data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Fluency Studio · English B1 → B2: Independent User',
  description:
    '64-hour guided English B1 to B2 course across 8 modules, spaced-repetition vocabulary, and AI speaking & writing studios.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const summary = await loadHeaderSummary();

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#faf9f6] text-stone-900 antialiased">
        <AppHeader summary={summary} />
        <div className="min-h-[calc(100vh-118px)]">{children}</div>
        <footer className="border-t border-stone-200 bg-white/60 py-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-xs text-stone-500 sm:px-6">
            <p>Fluency Studio · English B1 → B2: Independent User (64 guided hours)</p>
            <div className="flex items-center gap-4">
              <Link href="/curriculum" className="hover:text-stone-800">Curriculum</Link>
              <Link href="/labs" className="hover:text-stone-800">Labs</Link>
              <Link href="/pricing" className="hover:text-stone-800">Pricing</Link>
              <Link href="/privacy" className="hover:text-stone-800">Privacy</Link>
              <Link href="/terms" className="hover:text-stone-800">Terms</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { HeaderSummary } from '@/lib/b1b2/types';
import SignOutButton from './SignOutButton';

const BAND_LABEL: Record<string, string> = {
  B1_low: 'B1 Low',
  B1_mid: 'B1 Mid',
  B1_high: 'B1 High',
  B1_plus: 'B1+',
  B2_entry: 'B2 Entry',
  B2_developing: 'B2 Developing',
  B2_solid: 'B2 Solid',
};

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/curriculum', label: 'Curriculum' },
  { href: '/vocabulary', label: 'Vocabulary' },
  { href: '/review', label: 'Review' },
  { href: '/checkpoints', label: 'Checkpoints' },
  { href: '/labs', label: 'Labs' },
  { href: '/pricing', label: 'Pricing' },
];

export default function AppHeader({ summary }: { summary: HeaderSummary }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-[#faf9f6]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-700 text-xs font-bold text-white">
              FS
            </span>
            <span className="text-sm font-bold tracking-tight text-stone-900">Fluency Studio</span>
            <span className="hidden rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-stone-600 sm:inline-flex">
              B1 → B2
            </span>
          </Link>

          <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'bg-stone-900 text-white'
                      : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {summary.signedIn ? (
            <>
              <div className="hidden items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs sm:flex">
                <span className="font-semibold text-indigo-700">{BAND_LABEL[summary.band] ?? 'B1 Low'}</span>
                <span aria-hidden className="text-stone-300">·</span>
                <span className="font-semibold text-stone-800">{summary.xpTotal} XP</span>
                <span aria-hidden className="text-stone-300">·</span>
                <span className="font-semibold text-amber-700">{summary.streakDays}d streak</span>
                <span aria-hidden className="text-stone-300">·</span>
                <span className="text-stone-500">{summary.lessonsCompleted}/64</span>
              </div>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link
                href="/onboarding/placement"
                className="hidden rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 sm:inline-flex"
              >
                Placement check
              </Link>
              <Link
                href="/login"
                className="rounded-lg bg-indigo-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-800"
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Compact mobile nav */}
      <nav aria-label="Mobile navigation" className="flex items-center gap-1 overflow-x-auto border-t border-stone-200/70 px-4 py-2 md:hidden">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold ${
                active ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-200/70'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

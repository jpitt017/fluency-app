'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Award,
  BookOpen,
  CreditCard,
  Layers,
  LayoutDashboard,
  Mic,
  RotateCcw,
} from 'lucide-react';
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
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/curriculum', label: 'Curriculum', icon: BookOpen },
  { href: '/vocabulary', label: 'Vocabulary', icon: Layers },
  { href: '/review', label: 'Review', icon: RotateCcw },
  { href: '/checkpoints', label: 'Checkpoints', icon: Award },
  { href: '/labs', label: 'Labs', icon: Mic },
  { href: '/pricing', label: 'Pricing', icon: CreditCard },
];

export default function AppHeader({ summary }: { summary: HeaderSummary }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-[#faf9f6]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-5">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-800 text-xs font-bold tracking-tight text-white shadow-xs ring-1 ring-indigo-900/10 transition group-hover:scale-[1.03]">
              FS
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-stone-900">Fluency Studio</span>
              <span className="hidden rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-600 sm:inline-flex">
                B1 → B2
              </span>
            </div>
          </Link>

          <nav aria-label="Main navigation" className="hidden items-center gap-0.5 md:flex">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'bg-stone-900 text-white shadow-2xs'
                      : 'text-stone-600 hover:bg-stone-200/60 hover:text-stone-900'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 opacity-80" strokeWidth={2} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {summary.signedIn ? (
            <>
              <Link
                href="/dashboard"
                className="hidden items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs shadow-2xs transition hover:border-indigo-300 lg:flex"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="font-semibold text-indigo-700">{BAND_LABEL[summary.band] ?? 'B1 Low'}</span>
                <span aria-hidden className="text-stone-300">·</span>
                <span className="font-medium text-stone-700">{summary.lessonsCompleted}/64</span>
                <span aria-hidden className="text-stone-300">·</span>
                <span className="font-medium text-amber-700">{summary.streakDays}d</span>
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link
                href="/onboarding/placement"
                className="hidden rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-2xs transition hover:bg-stone-50 sm:inline-flex"
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
      <nav
        aria-label="Mobile navigation"
        className="flex items-center gap-1 overflow-x-auto border-t border-stone-200/70 px-4 py-2 md:hidden"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${
                active ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-200/70'
              }`}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

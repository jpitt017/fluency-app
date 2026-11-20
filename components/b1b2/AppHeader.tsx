'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Award,
  BookOpen,
  CreditCard,
  Layers,
  LayoutDashboard,
  Menu,
  Mic,
  RotateCcw,
  X,
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
  const isLoginPage = pathname === '/login';
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-[#faf9f6]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
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
        </div>

        {/* Single responsive navigation list in the DOM (never duplicated) */}
        {!isLoginPage && (
          <nav
            aria-label="Main navigation"
            className={`${
              mobileOpen ? 'flex' : 'hidden'
            } order-3 w-full flex-wrap items-center gap-1 border-t border-stone-200/70 pt-2 md:order-2 md:flex md:w-auto md:flex-nowrap md:border-t-0 md:pt-0`}
          >
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
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
        )}

        <div className="order-2 flex items-center gap-2 md:order-3">
          {isLoginPage ? (
            <>
              <Link
                href="/onboarding/placement"
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-2xs transition hover:bg-stone-50"
              >
                Placement check
              </Link>
              <Link
                href="/"
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-stone-600 transition hover:bg-stone-200/60 hover:text-stone-900"
              >
                Overview
              </Link>
            </>
          ) : summary.signedIn ? (
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

          {!isLoginPage && (
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-700 md:hidden"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

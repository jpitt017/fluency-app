'use client';

import { useState } from 'react';
import Link from 'next/link';

const INCLUDED = [
  'Unlimited AI speaking evaluation (content, grammar & coherence) + Shadowing Studio',
  'Writing studio with line-by-line B2 error feedback and rewrite coaching',
  'Real-time conversational English role-play across B1 → B2 scenarios',
  'Practice for your mistakes and a place to save your work',
  'Teacher console support for live feedback and pronunciation notes',
];

export default function PricingPage() {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleCheckout() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
      });
      const data = (await res.json()) as { url?: string; error?: string };

      if (!res.ok) {
        throw new Error(data.error || 'Failed to initialize checkout session.');
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned from server.');
      }
    } catch (err: unknown) {
      console.error(err);
      setErrorMessage(
        err instanceof Error ? err.message : 'Network error. Please check your connection and try again.',
      );
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-140px)] max-w-4xl items-center justify-center px-4 py-12 sm:px-6">
      <div className="grid w-full gap-6 rounded-2xl border border-stone-200 bg-white p-8 shadow-xs md:grid-cols-12 md:items-center">
        <div className="space-y-4 md:col-span-7">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
            Fluency Studio Pro · B1 → B2
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">
            Full Access to Fluency Studio
          </h1>
          <p className="text-sm leading-6 text-stone-600">
            Prepare for B2 with speaking and writing feedback. Practise conversations and review mistakes.
          </p>
          <ul className="space-y-2 pt-2 text-sm text-stone-700">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-5 rounded-2xl border border-stone-200 bg-stone-50 p-6 text-center md:col-span-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Monthly Membership</p>
            <div className="mt-2 flex items-baseline justify-center gap-1">
              <span className="text-4xl font-extrabold text-stone-900">£19</span>
              <span className="text-xs font-medium text-stone-500">/ month</span>
            </div>
          </div>

          {errorMessage && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-left text-xs text-rose-700">
              {errorMessage}
            </div>
          )}

          <button
            type="button"
            onClick={handleCheckout}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-800 disabled:opacity-60"
          >
            {loading ? 'Connecting to Stripe…' : 'Upgrade to Pro'}
          </button>

          <p className="text-xs text-stone-500">
            Secure billing via Stripe. Cancel anytime from your account.
          </p>

          <Link href="/labs" className="inline-block text-xs font-semibold text-indigo-700 hover:underline">
            Try the AI Speaking &amp; Writing Labs →
          </Link>
        </div>
      </div>
    </main>
  );
}

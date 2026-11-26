'use client';

import { useState } from 'react';

type Usage = { daily_unit_limit: number; daily_units_remaining: number };

export default function AiUsageDisclosure() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (loaded || loading) return;
    setLoading(true);
    let succeeded = false;
    try {
      const response = await fetch('/api/ai/usage', { cache: 'no-store', credentials: 'same-origin' });
      const result = await response.json() as Usage | { error?: string };
      if (!response.ok) throw new Error('error' in result ? result.error : undefined);
      setUsage(result as Usage);
      setMessage('');
      succeeded = true;
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : 'We cannot show AI practice right now.');
    } finally {
      setLoaded(succeeded);
      setLoading(false);
    }
  }

  const limit = usage ? Math.max(1, usage.daily_unit_limit) : 1;
  const remaining = usage ? Math.max(0, Math.min(usage.daily_units_remaining, limit)) : 0;
  const share = usage ? remaining / limit : 0;
  const label = remaining === 0 ? 'Finished for today' : share <= 0.25 ? 'Nearly finished for today' : 'Plenty left today';

  return <div className="mt-4 rounded-xl border border-stone-200 p-4">
    <button type="button" onClick={() => void toggle()} aria-expanded={open} className="font-semibold text-indigo-700 underline">
      {open ? 'Hide AI practice' : 'Check AI practice today'}
    </button>
    {open && <div className="mt-3" aria-live="polite">
      {loading && <p className="text-sm text-stone-600">Checking your AI practice…</p>}
      {message && <p className="text-sm text-stone-600">{message}</p>}
      {usage && <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">AI practice today</p>
          <p className="text-sm font-semibold text-stone-700">{label}</p>
        </div>
        <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-stone-200" role="progressbar"
          aria-valuemin={0} aria-valuemax={limit} aria-valuenow={remaining} aria-valuetext={label} aria-label="AI practice left today">
          <div className={`h-full rounded-full ${remaining === 0 ? 'bg-stone-400' : share <= 0.25 ? 'bg-amber-500' : 'bg-emerald-600'}`}
            style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
        <p className="mt-1 text-sm text-stone-600">Your AI practice starts again every night at midnight. This is Madrid time.</p>
      </>}
    </div>}
  </div>;
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';

const PACE_OPTIONS = [
  { hours: 3, label: '3h / wk', hint: 'Light pace' },
  { hours: 4, label: '4h / wk', hint: 'Steady pace' },
  { hours: 5, label: '5h / wk', hint: 'Balanced' },
  { hours: 8, label: '8h / wk', hint: 'Intensive' },
  { hours: 10, label: '10h / wk', hint: 'Sprint' },
] as const;

export function WeeklyPaceSelector({
  currentHours,
}: {
  currentHours: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [hours, setHours] = useState(currentHours);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const dailyMinutes = Math.round((hours * 60) / 7);

  async function selectHours(nextHours: number) {
    setHours(nextHours);
    setSaving(true);
    setStatus('');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in required.');
      const { error } = await supabase
        .from('profiles')
        .update({ weekly_goal_hours: nextHours })
        .eq('id', user.id);
      if (error) throw error;
      setStatus(`Saved (${nextHours}h/wk)`);
      router.refresh();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Study Pace</p>
          <h2 className="mt-0.5 font-serif text-lg font-semibold text-stone-900">
            {hours} hrs / week
            <span className="ml-2 font-sans text-xs font-medium text-stone-500">
              · ~{dailyMinutes} min/day
            </span>
          </h2>
        </div>
        {status && <span className="text-xs font-semibold text-emerald-700">{status}</span>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {PACE_OPTIONS.map((opt) => {
          const active = hours === opt.hours;
          return (
            <button
              key={opt.hours}
              type="button"
              disabled={saving}
              onClick={() => selectHours(opt.hours)}
              className={`rounded-xl border px-2.5 py-2 text-left transition ${
                active
                  ? 'border-indigo-700 bg-indigo-50 text-indigo-950 ring-1 ring-indigo-200'
                  : 'border-stone-200 bg-white text-stone-700 hover:border-indigo-300'
              }`}
            >
              <span className="block text-xs font-bold">{opt.label}</span>
              <span className="block text-[10px] text-stone-500">{opt.hint}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

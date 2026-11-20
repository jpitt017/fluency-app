'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { WeeklyReportRow } from '@/lib/b1b2/types';

const PACE_OPTIONS = [
  { hours: 3, label: '3h / wk', hint: 'Steady · ~20 wks' },
  { hours: 5, label: '5h / wk', hint: 'Balanced · ~12 wks' },
  { hours: 8, label: '8h / wk', hint: 'Standard · 8 wks' },
  { hours: 10, label: '10h / wk', hint: 'Focused · ~6 wks' },
  { hours: 12, label: '12h / wk', hint: 'Intensive · ~5 wks' },
] as const;

export function WeeklyPaceSelector({ currentHours }: { currentHours: number }) {
  const router = useRouter();
  const [hours, setHours] = useState(currentHours);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  async function selectHours(nextHours: number) {
    setHours(nextHours);
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch('/api/curriculum/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetHoursPerWeek: nextHours }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Could not save study pace.');
      }
      setStatus(`Saved (${nextHours}h/week)`);
      router.refresh();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Study Pace</p>
          <p className="mt-0.5 text-sm font-semibold text-stone-900">Weekly target ({hours} hrs/week)</p>
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
              className={`rounded-xl border px-3 py-2 text-left transition ${
                active
                  ? 'border-indigo-700 bg-indigo-50 text-indigo-950'
                  : 'border-stone-200 bg-white text-stone-700 hover:border-indigo-300'
              }`}
            >
              <span className="block text-xs font-bold">{opt.label}</span>
              <span className="block text-[10px] text-stone-500">{opt.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WeeklyReportCard({ report }: { report: WeeklyReportRow | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refreshReport() {
    setBusy(true);
    setError('');
    try {
      const { error: rpcErr } = await supabase.rpc('build_weekly_report');
      if (rpcErr) throw rpcErr;
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not build weekly report.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Weekly Report</p>
          <h2 className="mt-1 font-serif text-lg font-bold text-stone-900">
            {report ? `Week of ${report.week_start}` : 'This Week in Review'}
          </h2>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={refreshReport}
          className="rounded-xl border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
        >
          {busy ? 'Generating…' : report ? 'Refresh report' : 'Generate report'}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-rose-700">{error}</p>}

      {report ? (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-stone-50 p-3">
              <p className="text-[11px] font-semibold uppercase text-stone-500">Study time</p>
              <p className="mt-1 text-lg font-bold text-stone-900">{report.study_minutes}m</p>
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
              <p className="text-[11px] font-semibold uppercase text-stone-500">Words reviewed</p>
              <p className="mt-1 text-lg font-bold text-stone-900">{report.words_learned}</p>
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
              <p className="text-[11px] font-semibold uppercase text-stone-500">Recordings</p>
              <p className="mt-1 text-lg font-bold text-stone-900">{report.recordings}</p>
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
              <p className="text-[11px] font-semibold uppercase text-stone-500">Writing drafts</p>
              <p className="mt-1 text-lg font-bold text-stone-900">{report.writing_tasks}</p>
            </div>
          </div>
          {report.weakest_skill && (
            <p className="text-xs text-stone-600">
              Recommended focus area: <strong className="capitalize text-stone-900">{report.weakest_skill}</strong>
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-stone-600">
          Generate a snapshot of your study minutes, vocabulary retention, speaking recordings, and weakest skill for this week.
        </p>
      )}
    </div>
  );
}

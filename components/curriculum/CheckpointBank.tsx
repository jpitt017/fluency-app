'use client';

import { useMemo, useState } from 'react';
import { Eye, EyeOff, Filter } from 'lucide-react';
import type { AssessmentItem } from '@/lib/curriculum/details';

export default function CheckpointBank({ items }: { items: AssessmentItem[] }) {
  const [week, setWeek] = useState<'all' | '1' | '2' | '3' | '4'>('all');
  const [includeReserves, setIncludeReserves] = useState(true);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () =>
      items.filter((item) => {
        if (week !== 'all' && item.week !== Number(week)) return false;
        if (!includeReserves && item.id.includes('R')) return false;
        return true;
      }),
    [items, week, includeReserves],
  );

  const allRevealed = revealed.size === visible.length && visible.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-500">
          <Filter className="h-3.5 w-3.5" />
          Week
        </div>
        {(['all', '1', '2', '3', '4'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setWeek(value)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              week === value ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {value === 'all' ? 'All 24' : `W${value}`}
          </button>
        ))}
        <label className="ml-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-stone-600">
          <input
            type="checkbox"
            checked={includeReserves}
            onChange={(event) => setIncludeReserves(event.target.checked)}
            className="h-3.5 w-3.5 accent-indigo-700"
          />
          Include 4 reserves
        </label>
        <button
          type="button"
          onClick={() => setRevealed(allRevealed ? new Set() : new Set(visible.map((item) => item.id)))}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:border-indigo-300"
        >
          {allRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {allRevealed ? 'Hide keys' : 'Reveal keys'}
        </button>
      </div>

      <p className="text-[11px] text-stone-500">
        Showing {visible.length} items. In the live checkpoint the reason appears only after the whole quiz is submitted.
      </p>

      <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {visible.map((item) => {
          const isRevealed = revealed.has(item.id);
          return (
            <div key={item.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-800">
                  {item.id}
                </span>
                <span className="text-[11px] font-semibold text-stone-600">Week {item.week} · {item.target}</span>
                {item.id.includes('R') && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">Reserve</span>
                )}
              </div>
              <p className="mt-2 text-sm leading-6 text-stone-900">{item.prompt}</p>
              {item.options.length > 0 && (
                <p className="mt-1 font-mono text-[11px] text-stone-500">Options: {item.options.join(' / ')}</p>
              )}
              <div className="mt-2 flex flex-wrap items-start gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setRevealed((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    })
                  }
                  className="rounded-lg border border-stone-200 px-2 py-0.5 text-[11px] font-semibold text-stone-700 hover:border-indigo-300"
                >
                  {isRevealed ? 'Hide key' : 'Show key'}
                </button>
                {isRevealed && (
                  <p className="flex-1 text-[11px] leading-5 text-stone-700">
                    <strong className="font-semibold text-emerald-800">Key:</strong> {item.key}{' '}
                    <span className="text-stone-500">— {item.reason}</span>
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import Link from 'next/link';
import { WEEK_TASKS } from '@/lib/curriculum/week-tasks.mjs';
import type { WeekProgress } from '@/lib/curriculum/week-progress';

export default function WeekProgressList({ week, progress }: { week: number; progress: WeekProgress }) {
  const doneCount = WEEK_TASKS.filter((task) => progress[task.key as keyof WeekProgress]?.done).length;
  return <>
    <div className="mt-4 flex items-center justify-between gap-4">
      <p className="font-semibold" aria-live="polite">{doneCount} of 6 tasks done</p>
      <p className="text-sm text-stone-600">Minutes are estimates</p>
    </div>
    <div
      role="progressbar"
      aria-label="This week's task progress"
      aria-valuemin={0}
      aria-valuemax={6}
      aria-valuenow={doneCount}
      className="mt-2 h-3 overflow-hidden rounded-full bg-stone-100"
    >
      <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${(doneCount / 6) * 100}%` }} />
    </div>
    <ul className="mt-4 grid gap-2 sm:grid-cols-2">
      {WEEK_TASKS.map((task) => {
        const item = progress[task.key as keyof WeekProgress];
        return <li key={task.key}>
          <Link
            href={`/week/${week}#${task.anchor}`}
            prefetch={false}
            className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-stone-200 p-3 hover:border-indigo-400"
          >
            <span>
              <strong>{task.label}</strong>
              <span className="mt-1 block text-sm text-stone-600">
                {item.itemsAnswered} {item.itemsAnswered === 1 ? 'item' : 'items'} answered · {item.minutes} min estimated
              </span>
            </span>
            {item.done ? <span className="font-semibold text-emerald-700" aria-label={`${task.label} done`}>✓</span> : <span aria-hidden="true" className="text-stone-400">○</span>}
          </Link>
        </li>;
      })}
    </ul>
  </>;
}

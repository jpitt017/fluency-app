'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { focusNextTask } from '@/components/b1b2/usePracticeNavigation';
import { WEEK_OVERVIEW_ANCHOR, nextWeekTask, weekTaskMinutesText, ACTION_BUTTON_CLASS } from '@/lib/curriculum/week-tasks.mjs';

/**
 * The learner layout of /week/[n]: a six-card overview over an accordion that
 * keeps one task open at a time.
 *
 * Tapping an overview card jumps to the task's dashboard anchor (`#reading-practice`
 * and friends), the same hashes the dashboard links use. The hash opens the
 * task, `FocusWeekSection` moves the focus, and every task ends with the shared
 * "Next: … →" button (whose label comes from the same task map as the cards).
 * Each row's h2 stays rendered whether the task is open or not, so section
 * anchors and headings remain focusable targets.
 *
 * Open state survives switching tasks, because the task bodies stay mounted and
 * only the `hidden` attribute changes.
 */

export type WeekTaskEntry = {
  key: string;
  /** Overview card label ("Reading"). */
  label: string;
  /** Row heading, as the task has always been titled ("Reading: The Switch-Off"). */
  heading: string;
  /** Dashboard anchor ("reading-practice"); also the region's id. */
  anchor: string;
  minutes: number;
  /** The ✓ on the card and the row, from completions and saved attempts. */
  done: boolean;
  /** Exact region label for tasks whose tests address them by region name. */
  regionLabel?: string;
  body: ReactNode;
};

function DoneMark() {
  return <span className="font-semibold text-emerald-700">✓<span className="sr-only">Done</span></span>;
}

export default function WeekTaskLayout({ tasks }: { tasks: WeekTaskEntry[] }) {
  // The first paint shows every task closed, so a deep link scrolls to a stable
  // layout; the effect below then opens the hash's task (or the first one).
  const [openKey, setOpenKey] = useState<string | null>(null);

  // Opening a task records it in the hash (without scrolling on its own), so a
  // reload or a shared link comes back to the same task.
  const openTask = (task: WeekTaskEntry) => {
    setOpenKey(task.key);
    if (!window.location.hash.includes(`#${task.anchor}`)) {
      window.history.replaceState(null, '', `#${task.anchor}`);
    }
  };

  useEffect(() => {
    function openWithScroll(match: WeekTaskEntry) {
      setOpenKey(match.key);
      // Opening a task changes the heights above the target, so the browser's
      // (or FocusWeekSection's) scroll can land short. Scroll again once the
      // open state has rendered, at a stable layout.
      requestAnimationFrame(() => {
        const section = document.getElementById(match.anchor);
        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        section?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
      });
    }
    function arrive() {
      const id = window.location.hash.slice(1);
      const match = tasks.find((task) => task.anchor === id);
      // Anything that isn't a task anchor (or no hash at all) opens the first
      // task, so the page never arrives with every row collapsed.
      if (match) openWithScroll(match);
      else setOpenKey(tasks[0]?.key ?? null);
    }
    function syncFromHash() {
      const id = window.location.hash.slice(1);
      const match = tasks.find((task) => task.anchor === id);
      if (match) openWithScroll(match);
    }
    function onOpenEvent(event: Event) {
      const anchor = (event as CustomEvent<string>).detail;
      const match = tasks.find((task) => task.anchor === anchor);
      if (match) setOpenKey(match.key);
    }
    arrive();
    window.addEventListener('hashchange', syncFromHash);
    window.addEventListener('week-task:open', onOpenEvent);
    return () => {
      window.removeEventListener('hashchange', syncFromHash);
      window.removeEventListener('week-task:open', onOpenEvent);
    };
  }, [tasks]);

  return (
    <div className="space-y-4">
      <section id={WEEK_OVERVIEW_ANCHOR} className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">This week&apos;s tasks</h2>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {tasks.map((task) => (
            <li key={task.key}>
              <a
                href={`#${task.anchor}`}
                onClick={() => setOpenKey(task.key)}
                className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 hover:border-indigo-300"
              >
                <span className="text-sm font-semibold">{task.label}</span>
                <span className="flex items-center gap-2 text-sm text-stone-600">
                  {weekTaskMinutesText(task.minutes)}
                  {task.done ? <DoneMark /> : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {tasks.map((task) => {
        const open = openKey === task.key;
        const next = nextWeekTask(tasks, task.key);
        const bodyId = `${task.anchor}-body`;
        return (
          <section
            key={task.key}
            id={task.anchor}
            aria-label={task.regionLabel}
            className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm target:scroll-mt-20"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 tabIndex={-1} className="text-xl font-semibold">
                <button
                  type="button"
                  id={`${task.anchor}-toggle`}
                  aria-expanded={open}
                  aria-controls={bodyId}
                  onClick={() => openTask(task)}
                  className="text-left"
                >
                  {task.heading}
                </button>
              </h2>
              <p className="flex shrink-0 items-center gap-2 text-sm text-stone-600">
                {weekTaskMinutesText(task.minutes)}
                {task.done ? <DoneMark /> : null}
              </p>
            </div>
            <div id={bodyId} hidden={!open} className="space-y-4">
              {task.body}
              <div>
                <button
                  type="button"
                  onClick={() => focusNextTask(next.href.slice(1))}
                  className={ACTION_BUTTON_CLASS}
                >
                  {next.label}
                </button>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

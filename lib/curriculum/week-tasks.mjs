/**
 * Pure, client-safe task map for the /week/[n] learner layout.
 *
 * The week page shows one task at a time under a six-card overview. This module
 * is the single source for the task order, dashboard-style anchors, rough time
 * labels and the shared button styles, so the overview cards, the accordion
 * rows and the "Next" buttons can never disagree. Unit tests and Playwright
 * specs import it with no build step, like `week-input-ui.mjs`.
 *
 * The minutes are fixed estimates per task kind (there is no authored timing
 * data); they tell a learner roughly how long a task takes, nothing more.
 */

/** The order the tasks open in, the overview lists them and "Next" walks them. */
export const WEEK_TASKS = [
  { key: 'grammar', label: 'Grammar', anchor: 'grammar-practice', minutes: 10 },
  { key: 'vocabulary', label: 'Vocabulary', anchor: 'vocabulary-practice', minutes: 10 },
  { key: 'reading', label: 'Reading', anchor: 'reading-practice', minutes: 10 },
  { key: 'listening', label: 'Listening', anchor: 'listening-practice', minutes: 8 },
  { key: 'speaking', label: 'Speaking', anchor: 'speaking-practice', minutes: 12 },
  { key: 'writing', label: 'Writing', anchor: 'writing-practice', minutes: 10 },
];

/** The overview heading anchor, so "Next: Week overview →" has a target. */
export const WEEK_OVERVIEW_ANCHOR = 'week-overview';

/** "10 min" on the overview cards and task rows. */
export function weekTaskMinutesText(minutes) {
  return `${minutes} min`;
}

/**
 * The next task in the sequence after `key`, skipping tasks that are not on
 * this week's page. The last task returns the overview, so every task ends
 * with a "Next: … →" button.
 */
export function nextWeekTask(tasks, key) {
  const index = tasks.findIndex((task) => task.key === key);
  const next = index >= 0 ? tasks[index + 1] : undefined;
  if (next) return { label: `Next: ${next.label} →`, href: `#${next.anchor}` };
  return { label: 'Next: Week overview →', href: `#${WEEK_OVERVIEW_ANCHOR}` };
}

/**
 * The one main action button style on /week/[n]: Check, Finish, Start
 * recording, Start speaking/writing task and the "Next: … →" button. A real
 * button in the same shape everywhere, at a 44 px minimum touch target.
 */
export const ACTION_BUTTON_CLASS = 'min-h-11 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50';

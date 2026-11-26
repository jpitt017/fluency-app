/**
 * Pure, client-safe helpers for the /week/[n] reading and listening tasks.
 *
 * Kept in a .mjs module so unit tests and Playwright specs can import the exact
 * labels, score sentences and responsive class strings the components use, with
 * no build step and no browser. Nothing here reads content or answer keys.
 */

/** The two-option sets that get large, side-by-side buttons instead of radios. */
export const SHORT_OPTION_SETS = [
  ['true', 'false'],
  ['yes', 'no'],
];

export function isShortOptionSet(options) {
  if (!Array.isArray(options) || options.length !== 2) return false;
  const normalized = options.map((option) => typeof option === 'string' ? option.trim().toLowerCase() : '');
  return SHORT_OPTION_SETS.some((set) => set.every((value) => normalized.includes(value)));
}

export function questionPositionLabel(index, total) {
  return `Question ${index + 1} of ${total}`;
}

export function wordPositionLabel(index, total) {
  return `Word ${index + 1} of ${total}`;
}

/** The sentence shown after the last question, e.g. "You answered 10 of 10. 8 were right." */
export function inputSummary(answered, correct, total) {
  return `You answered ${answered} of ${total}. ${correct} ${correct === 1 ? 'was' : 'were'} right.`;
}

/** The short score at the end of "Check four words". */
export function glossCheckScore(correct, total) {
  return `You got ${correct} of ${total} right.`;
}

/** Shared by the full transport controls and the small replay player. */
export function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The small replay player: fixed to the bottom of the screen on a phone, and a
 * static grid column on a computer (its inner card is sticky there). Kept as a
 * constant so the layout can be measured at 375 px and 1280 px in tests.
 */
export const MINI_PLAYER_WRAPPER_CLASS = [
  'fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white p-3 shadow-lg',
  'lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none',
].join(' ');

/** On a phone the text is an overlay; on a computer it is the left column. */
export function readingTextPanelClass(open) {
  return open
    ? 'fixed inset-0 z-40 overflow-y-auto bg-white p-4 sm:p-6 lg:static lg:z-auto lg:block lg:overflow-visible lg:bg-transparent lg:p-0'
    : 'hidden lg:block lg:static';
}

export const READING_TEXT_BUTTON_CLASS = 'fixed bottom-4 left-4 z-30 min-h-11 rounded-xl bg-indigo-700 px-4 py-2 font-semibold text-white shadow-lg lg:hidden';

export const READING_TEXT_INNER_CLASS = 'lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:rounded-xl lg:border lg:border-stone-200 lg:bg-white lg:p-4';

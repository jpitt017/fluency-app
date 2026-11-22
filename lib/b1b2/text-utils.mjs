/** Client-safe text helpers for learner writing tasks. */

/**
 * Count words the way learners expect: split on whitespace, ignore empty
 * fragments, and keep internal punctuation (e.g. "don't", "B1→B2") intact.
 */
export function countWords(text) {
  if (typeof text !== 'string') return 0;
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
}

/**
 * The counter a learner sees while typing: "23 / 60-100 words".
 *
 * A hyphen, not an en dash: the string is read out by screen readers as part of
 * a live region and is also asserted verbatim in tests.
 */
export function writingWordCounter(text, minimum = 15, maximum = 100, target = 60) {
  const words = countWords(text);
  return {
    words,
    label: `${words} / ${target}-${maximum} words`,
    minimum,
    maximum,
    target,
    meetsMinimum: words >= minimum,
    overMaximum: words > maximum,
  };
}

/**
 * Why the Evaluate button is disabled, in B1 wording. Returns null when there is
 * nothing to explain (the button is enabled).
 */
export function writingHint(words, minimum = 15) {
  if (words >= minimum) return null;
  return `Write at least ${minimum} words, or skip`;
}

/** Validate a writing sample against the range the task asks for. */
export function writingTaskStatus(text, minimum = 15, target = 60) {
  const words = countWords(text);
  if (words === 0) return { words, meetsMinimum: false, meetsTarget: false, message: `0 words · aim for ${minimum}–100 words` };
  const range = `${minimum}–100 words`;
  return {
    words,
    meetsMinimum: words >= minimum,
    meetsTarget: words >= target,
    message: `${words} word${words === 1 ? '' : 's'} · ${words < minimum ? `aim for ${range}` : 'enough to evaluate'}`,
  };
}

/**
 * Run a fetch with an abort timeout. The timeout produces an `Error` whose
 * message is the supplied text, so callers can show it directly.
 */
export async function fetchWithTimeout(
  input,
  init = {},
  timeoutMs = 45_000,
  timeoutMessage = 'This is taking too long. Check your connection and try again.',
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error(timeoutMessage);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

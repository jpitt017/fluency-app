import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Placement watchdog: only a Continue click may start the "did not move" timer.
 *
 * The bug this pins: the timer was armed by a `useEffect` keyed on
 * `[currentIndex, selectedOption]`, so *selecting an answer* started a 4-second
 * countdown and a learner who was simply thinking got told the page had failed.
 *
 * The behaviour itself is covered in the browser by
 * `tests/e2e/placement-writing.spec.mjs` ("selecting an answer and waiting does
 * not show the stuck warning"), which waits 5 s. These checks are the cheap,
 * deterministic guard on the wiring, and they name the exact mistake so a future
 * edit that reintroduces it fails with a useful message rather than a timeout.
 */

const source = readFileSync(new URL('../../components/b1b2/PlacementQuizClient.tsx', import.meta.url), 'utf8');

/** The body of a top-level function inside the component, by name. */
function functionBody(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start > -1, `${name} must exist in PlacementQuizClient`);
  // Find the closing brace of the function by walking braces.
  let depth = 0;
  let index = source.indexOf('{', start);
  const from = index;
  for (; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(from, index + 1);
    }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

test('selecting an answer never starts the watchdog', () => {
  const body = functionBody('selectOption');
  assert.doesNotMatch(
    body,
    /setTimeout|stuckTimer\.current\s*=/,
    'selectOption must not arm the timer: choosing an answer is not a request to advance',
  );
  assert.match(body, /setSelectedOption\(/, 'but it must still select the answer');
});

test('the Continue click arms the watchdog', () => {
  const body = functionBody('handleNextQuestion');
  assert.match(body, /stuckTimer\.current = setTimeout\(/, 'handleNextQuestion must start the timer');
  assert.match(body, /STUCK_TIMEOUT_MS/, 'and use the named timeout, not a loose number');
});

test('the timer is cleared when the question changes', () => {
  // The cleanup effect must depend on currentIndex and return the timer clear.
  assert.match(
    source,
    /useEffect\(\(\) => clearStuckTimer, \[currentIndex\]\);/,
    'a currentIndex effect must clear the timer on change and unmount',
  );
});

test('the warning is scoped to the question it fired on, so it clears on its own', () => {
  // A bare boolean needed a setState inside an effect to reset; keying it to the
  // index makes the warning stop matching as soon as the question advances.
  assert.match(source, /const \[stuckAt, setStuckAt\] = useState<number \| null>\(null\)/);
  assert.match(source, /\{stuckAt === currentIndex && \(/);
  assert.doesNotMatch(source, /\{stuck && \(/, 'the old boolean flag must be gone');
});

test('no effect keys the watchdog on the selected answer', () => {
  // The regression: `[currentIndex, selectedOption]` with a bare setTimeout.
  const effects = source.match(/useEffect\([\s\S]*?\}, \[[^\]]*\]\);/g) ?? [];
  for (const effect of effects) {
    const deps = effect.slice(effect.lastIndexOf('}, ['));
    if (deps.includes('selectedOption')) {
      assert.doesNotMatch(
        effect,
        /stuckTimer\.current = setTimeout/,
        'an effect keyed on selectedOption must not arm the stuck watchdog',
      );
    }
  }
});

test('the timeout is a named constant of 4 seconds', () => {
  assert.match(source, /const STUCK_TIMEOUT_MS = 4000;/);
});

test('the warning is reachable for tests but only rendered when stuck', () => {
  assert.match(source, /data-testid="placement-stuck-warning"/);
  assert.match(source, /\{stuckAt === currentIndex && \(/, 'the warning must stay behind the stuck check');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The listening player's controls, and the play-count route behind it.
 *
 * The component cannot be rendered here (it is a client component, and this repo
 * has no DOM test runner), so — like ai-route-auth.test.mjs and
 * provider-failure-response.test.mjs — this pins the source-level contract. What
 * it protects is the set of controls the learner was promised and the two rules
 * that are easy to lose: no play limit, and a report that can never break audio.
 */

const player = readFileSync(new URL('../../components/b1b2/ListeningTrialPlayer.tsx', import.meta.url), 'utf8');
const route = readFileSync(new URL('../../src/app/api/week/listening-play/route.ts', import.meta.url), 'utf8');

test('the player has the promised controls', () => {
  assert.match(player, /type="range"/, 'a draggable progress bar');
  assert.match(player, /⟲ \{SKIP_SECONDS\} s/, 'back 5 s');
  assert.match(player, /\{SKIP_SECONDS\} s ⟳/, 'forward 5 s');
  assert.match(player, /Pause/, 'play/pause');
  assert.match(player, /formatClock\(seconds\)\} \/ \{formatClock\(duration\)/, 'elapsed / total time');
  assert.match(player, /0\.75×/, 'a slow speed button');
  assert.match(player, /AI_TRIAL_LABEL/, 'the AI voice label stays');
});

test('keyboard and screen-reader affordances are present', () => {
  assert.match(player, /event\.key === ' '/, 'space toggles playback');
  assert.match(player, /ArrowLeft[\s\S]{0,120}ArrowRight/, 'arrows skip 5 s');
  assert.match(player, /aria-live="polite"/, 'state is announced');
  assert.match(player, /aria-pressed=\{playing\}/, 'play/pause exposes its state');
  assert.match(player, /aria-valuetext=/, 'the seek bar reads as a time');
  // A focused button must keep Space for itself, or pressing Pause would also
  // toggle playback through the container handler.
  assert.match(player, /closest\('button, input, a, select, textarea'\)/);
});

test('phones get large touch targets', () => {
  const targets = [...player.matchAll(/min-h-11 min-w-11/g)];
  assert.ok(targets.length >= 4, `expected every control to be at least 44px, found ${targets.length}`);
});

test('there is no play limit, only guidance', () => {
  assert.doesNotMatch(player, /listensLeft|both listens used|disabled=\{!playing/);
  assert.match(player, /Play it again as often as you need/);
});

test('a play report can never interrupt listening', () => {
  // No await, and the failure is swallowed: audio is unaffected either way.
  assert.match(route, /status: 204/, 'no content when there is nobody to record');
  assert.match(route, /isReportablePlay/, 'the count is range-checked before use');
  assert.match(route, /console\.info\('\[listening_play\]'/, 'recorded where the teacher can see it');
  assert.doesNotMatch(route, /error\.message|String\(error\)/, 'no internal error reaches the learner');
  // The player must not gate playback on the response.
  assert.match(player, /keepalive: true/);
  assert.doesNotMatch(player, /if \(!response\.ok\)/, 'a failed report must not stop the audio');
});

test('the route needs no migration', () => {
  assert.doesNotMatch(route, /\.from\(|\.insert\(|\.upsert\(/, 'nothing is stored yet, so nothing can fail on schema');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const player = readFileSync(new URL('../../components/b1b2/ListeningTrialPlayer.tsx', import.meta.url), 'utf8');
const controls = readFileSync(new URL('../../components/b1b2/AudioTransportControls.tsx', import.meta.url), 'utf8');
const route = readFileSync(new URL('../../src/app/api/week/listening-play/route.ts', import.meta.url), 'utf8');

test('the shared transport has the listening and speaking controls', () => {
  assert.match(controls, /type="range"/, 'a draggable progress bar');
  assert.match(controls, /⟲ \{SKIP_SECONDS\} s/, 'back 5 s');
  assert.match(controls, /\{SKIP_SECONDS\} s ⟳/, 'forward 5 s');
  assert.match(controls, /Stop/, 'stop playback');
  assert.match(controls, /Pause/, 'play/pause');
  assert.match(controls, /formatClock\(value\)\} \/ \{formatClock\(duration\)/, 'elapsed / total time');
  assert.match(controls, /0\.75×|1×/, 'playback speed');
});

test('keyboard and screen-reader affordances are present in the shared player', () => {
  assert.match(controls, /event\.key === ' '/, 'space toggles playback');
  assert.match(controls, /ArrowLeft[\s\S]{0,160}ArrowRight/, 'arrows skip 5 s');
  assert.match(controls, /aria-pressed=\{playing\}/, 'play/pause exposes its state');
  assert.match(controls, /aria-valuetext=/, 'the seek bar reads as a time');
  assert.match(controls, /closest\('button, input, a, select, textarea'\)/, 'focused controls retain native key behavior');
  assert.match(player, /<AudioTransportControls/);
});

test('phones get large touch targets on every transport control', () => {
  const targets = [...controls.matchAll(/min-h-11 min-w-11/g)];
  assert.ok(targets.length >= 5, `expected every control to be at least 44px, found ${targets.length}`);
});

test('the listening trial has no play limit, only guidance', () => {
  assert.doesNotMatch(player, /listensLeft|both listens used|disabled=\{!playing/);
  assert.match(player, /Play it again as often as you need/);
});

test('a play report can never interrupt listening', () => {
  assert.match(route, /status: 204/);
  assert.match(route, /isReportablePlay/);
  assert.match(route, /console\.info\('\[listening_play\]'/);
  assert.doesNotMatch(route, /error\.message|String\(error\)/);
  assert.match(player, /keepalive: true/);
  assert.doesNotMatch(player, /if \(!response\.ok\)/);
});

test('the route needs no migration', () => {
  assert.doesNotMatch(route, /\.from\(|\.insert\(|\.upsert\(/);
});

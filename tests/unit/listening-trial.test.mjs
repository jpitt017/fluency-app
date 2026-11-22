import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AI_TRIAL_LABEL,
  TRIAL_PLAYS_ALLOWED,
  TRIAL_TRACKS,
  TRIAL_WEEKS,
  canPlayAgain,
  describeTrialSpeakers,
  isTrialWeek,
  playsUsed,
  resolveTrialAudio,
  trialAudioKey,
  trialCaptionsKey,
} from '../../lib/curriculum/listening-audio.ts';

const details = JSON.parse(
  readFileSync(new URL('../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json', import.meta.url)),
);

const releasedRow = (week) => ({
  week,
  audio_url: `https://example.supabase.co/storage/v1/object/public/course-audio/${trialAudioKey(week)}`,
  captions_url: `https://example.supabase.co/storage/v1/object/public/course-audio/${trialCaptionsKey(week)}`,
  source: 'ai-trial',
  released: true,
});

test('the four scheduled tracks match the authored Weeks 1–4 listening scripts', () => {
  assert.deepEqual(TRIAL_WEEKS, [1, 2, 3, 4]);
  for (const track of TRIAL_TRACKS) {
    const authored = details.listening.weeks.find((week) => week.week === track.week);
    assert.ok(authored, `week ${track.week} exists in the curriculum file`);
    assert.equal(track.title, authored.title);
    for (const host of track.hosts) {
      assert.match(authored.speakers, new RegExp(host.speaker, 'i'));
      const accent = host.accent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.match(authored.speakers, new RegExp(accent, 'i'));
    }
  }
});

test('the accent range covers all seven speakers in the course spec', () => {
  const accents = TRIAL_TRACKS.flatMap((track) => track.hosts.map((host) => `${host.speaker}:${host.accent}`));
  assert.deepEqual(accents, [
    'Host:southern English',
    'Ellie:Scottish',
    'Aisha:London',
    'Tom:northern English',
    'Dan:Welsh',
    'Marta:West Midlands',
    'Joanne:Yorkshire',
  ]);
});

test('nothing plays while a track is unreleased, and the label says it is AI', () => {
  for (const week of TRIAL_WEEKS) {
    const unreleased = { ...releasedRow(week), audio_url: null, released: false };
    assert.equal(resolveTrialAudio(week, [unreleased]), null);
    const uploadedButUnapproved = { ...releasedRow(week), released: false };
    assert.equal(resolveTrialAudio(week, [uploadedButUnapproved]), null);
  }
});

test('a released AI trial row resolves to a playable track with accent metadata', () => {
  const playable = resolveTrialAudio(1, [releasedRow(1)]);
  assert.ok(playable);
  assert.equal(playable.label, AI_TRIAL_LABEL);
  assert.equal(playable.label, 'AI voice – trial recording');
  assert.equal(playable.playsAllowed, 2);
  assert.equal(playable.speakers, 'Host (southern English) · Ellie (Scottish)');
  assert.match(playable.audioUrl, /weeks-01-04\/ai-trial\/week-1-listening\.mp3$/);
  assert.match(playable.captionsUrl, /week-1-listening\.vtt$/);
});

test('resolveTrialAudio fails closed on every unexpected shape', () => {
  assert.equal(resolveTrialAudio(1, null), null);
  assert.equal(resolveTrialAudio(1, []), null);
  assert.equal(resolveTrialAudio(1, [{ ...releasedRow(2) }]), null, 'only the requested week is used');
  assert.equal(resolveTrialAudio(5, [releasedRow(5)]), null, 'weeks without a scheduled trial never play');
  assert.equal(resolveTrialAudio(1, [{ ...releasedRow(1), source: 'voice-actor' }]), null, 'not the AI trial');
  assert.equal(resolveTrialAudio(1, [{ ...releasedRow(1), audio_url: '   ' }]), null, 'blank URL');
  assert.equal(resolveTrialAudio(1, [{ ...releasedRow(1), captions_url: null }]).captionsUrl, null);
});

test('trial storage keys are fixed, never built from input', () => {
  assert.equal(trialAudioKey(1), 'weeks-01-04/ai-trial/week-1-listening.mp3');
  assert.equal(trialCaptionsKey(4), 'weeks-01-04/ai-trial/week-4-listening.vtt');
  assert.equal(isTrialWeek(4), true);
  assert.equal(isTrialWeek(5), false);
  assert.equal(describeTrialSpeakers(4), 'Joanne (Yorkshire)');
});

test('the play limit is two, and a tampered counter cannot unlock more', () => {
  assert.equal(TRIAL_PLAYS_ALLOWED, 2);
  assert.equal(playsUsed(null), 0);
  assert.equal(playsUsed(''), 0);
  assert.equal(playsUsed('1'), 1);
  assert.equal(playsUsed('2'), 2);
  assert.equal(playsUsed('-4'), 0);
  assert.equal(playsUsed('nonsense'), 0);
  assert.equal(playsUsed('99'), 2, 'clamped to the allowed number of listens');
  assert.equal(canPlayAgain(0), true);
  assert.equal(canPlayAgain(1), true);
  assert.equal(canPlayAgain(2), false);
});

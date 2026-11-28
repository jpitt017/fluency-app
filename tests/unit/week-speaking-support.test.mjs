import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { publicSpeakingSupport, phrasesUsed, splitHighlightedText, validSupportNotes } from '../../lib/curriculum/speaking-support.mjs';

const require = createRequire(import.meta.url);
const support = require('../../supabase-b1-b2/content/curriculum/speaking-support-weeks-01-04.json');
const details = require('../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json');
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

for (const item of support.weeks) {
  test(`Week ${item.week} projects only planning and retry guidance before the first recording`, () => {
    const projected = publicSpeakingSupport(item);
    assert.deepEqual(projected.planNotes, item.planNotes);
    assert.equal(projected.retryGoal, item.retryGoal);
    assert.equal(Object.hasOwn(projected, 'focusQuestion'), false);
    assert.equal(Object.hasOwn(projected, 'noticePhrases'), false);
    assert.equal(Object.hasOwn(projected, 'answerIndex'), false);
    assert.equal(Object.hasOwn(projected, 'voice'), false);
  });

  test(`Week ${item.week} useful phrases are exact substrings of the model`, () => {
    const model = details.weeks.find((week) => week.number === item.week).speaking.model;
    for (const phrase of item.noticePhrases) {
      assert.ok(model.toLocaleLowerCase('en-GB').includes(phrase.toLocaleLowerCase('en-GB')), `${phrase} must be present verbatim`);
    }
    for (const phrase of item.distractors) {
      assert.ok(!model.toLocaleLowerCase('en-GB').includes(phrase.toLocaleLowerCase('en-GB')), `${phrase} must be a distractor`);
    }
  });
}

test('phrase matching and transcript highlighting preserve exact phrase text', () => {
  const transcript = "Since then, I've made friends. I also think it's quieter than downtown.";
  const phrases = ["Since then, I've", "It's quieter than", 'My goal is to'];
  assert.deepEqual(phrasesUsed(transcript, phrases), ["Since then, I've", "It's quieter than"]);
  assert.deepEqual(splitHighlightedText(transcript, phrases), [
    { text: "Since then, I've", highlighted: true },
    { text: ' made friends. I also think ', highlighted: false },
    { text: "it's quieter than", highlighted: true },
    { text: ' downtown.', highlighted: false },
  ]);
});

test('notes must match every cue point label and are length-limited', () => {
  const labels = ['Before', 'The change'];
  assert.deepEqual(validSupportNotes([
    { label: 'Before', note: 'old routine' },
    { label: 'The change', note: 'new city'.repeat(100) },
  ], labels), [
    { label: 'Before', note: 'old routine' },
    { label: 'The change', note: 'new city'.repeat(75) },
  ]);
  assert.equal(validSupportNotes([{ label: 'wrong', note: 'x' }, { label: 'The change', note: '' }], labels), null);
  assert.equal(validSupportNotes([], labels), null);
});

test('focus-question and phrase-noticing answer routes are removed', () => {
  assert.equal(existsSync(new URL('../../src/app/api/week/speaking/focus/route.ts', import.meta.url)), false);
  assert.equal(existsSync(new URL('../../src/app/api/week/speaking/notice/route.ts', import.meta.url)), false);
  const projection = read('lib/curriculum/week-speaking-support.ts');
  assert.match(projection, /model: unlocked \? \{ text:/);
  assert.match(projection, /usefulPhrases: unlocked \? config\.noticePhrases : \[\]/);
  assert.doesNotMatch(projection, /focus_choice|focus_correct|notice_selected/);
  const returnedState = projection.slice(projection.indexOf('  return {'), projection.indexOf('\n  };', projection.indexOf('  return {')));
  assert.doesNotMatch(returnedState, /answerIndex|focusQuestion|distractors/);
});

test('the model and useful phrases stay server-gated until the kept first recording is checked', () => {
  const projection = read('lib/curriculum/week-speaking-support.ts');
  assert.match(projection, /const unlocked = Boolean\(flow\?\.model_unlocked && attempt\?\.first_recording_path && attempt\.first_transcript\)/);
  assert.match(projection, /model: unlocked \? \{ text: staticWeek\.speaking\.model, audioUrl: modelAudioUrl, parts: config\.modelParts \} : null/);
  assert.match(projection, /usefulPhrases: unlocked \? config\.noticePhrases : \[\]/);
  const page = read('src/app/week/[n]/page.tsx');
  assert.match(page, /loadWeekSpeakingSupport\(number\)/);
});

test('the model script is hidden until asked for, with labelled parts and comparisons', () => {
  const component = read('components/b1b2/WeekSpeakingSupport.tsx');
  assert.match(component, /const \[scriptShown, setScriptShown\] = useState\(false\)/);
  assert.match(component, /Show the script/);
  assert.match(component, /aria-expanded=\{scriptShown\}/);
  assert.match(component, /<SpeakingModelPlayer text=\{model\.text/);
  assert.match(component, /part\.cuePoints\.join/);
  assert.match(component, /part\.purpose/);
  assert.match(component, /<Transcript text=\{part\.text\} phrases=\{usefulPhrases\}/);
  assert.match(component, /phrasesUsed\(take\.transcript, phrases\)/);
  assert.match(component, /Cue-card points found/);
  assert.doesNotMatch(component, /focusQuestion|markFocusAnswer|saveNotice|noticeSelected|Check and continue|tap the phrases you hear/);
});

test('system explanations are removed from learner speaking view and transcript is folded', () => {
  const component = read('components/b1b2/WeekSpeakingSupport.tsx');
  const detailsView = read('components/b1b2/SpeakingFeedbackDetails.tsx');
  assert.match(component, /Checks left: \{checksRemaining\}/);
  assert.doesNotMatch(component, /Scores for older recordings used a different method/);
  assert.doesNotMatch(component, /There are five checks in total/);
  assert.doesNotMatch(component, /of 5 weekly checks used/);
  assert.doesNotMatch(detailsView, /We do not know how you pronounced them/);
  assert.doesNotMatch(detailsView, /Build a better sentence/);
  assert.match(detailsView, /<details[\s\S]*?<summary[^>]*>\s*Your transcript\s*<\/summary>/);
});

test('the speaking model uses the shared audio transport controls, including stop', () => {
  const player = read('components/b1b2/SpeakingModelPlayer.tsx');
  const controls = read('components/b1b2/AudioTransportControls.tsx');
  const listening = read('components/b1b2/ListeningTrialPlayer.tsx');
  assert.match(player, /<AudioTransportControls/);
  assert.match(listening, /<AudioTransportControls/);
  for (const marker of ['⟲ {SKIP_SECONDS} s', '{SKIP_SECONDS} s ⟳', 'Stop', '0.75×', 'type="range"', "event.key === ' '", 'ArrowLeft', 'ArrowRight']) {
    assert.ok(controls.includes(marker), `shared controls include ${marker}`);
  }
});

test('migration and Delete my data history are retained without clearing old attempts', () => {
  const migration = read('supabase-b1-b2/migrations/0060_week_speaking_support.sql');
  for (const column of ['notes', 'focus_choice', 'focus_correct', 'notice_selected', 'first_recording_path', 'second_recording_path']) {
    assert.match(migration, new RegExp(`\\b${column}\\b`));
  }
  assert.match(migration, /delete from public\.week_speaking_attempts/);
  assert.match(migration, /delete_my_learning_data\(\)/);
});

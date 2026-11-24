import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const details = JSON.parse(read('supabase-b1-b2/content/curriculum/weeks-01-04-details.json'));
const learnerWeek = read('lib/curriculum/learner-week.ts');

/**
 * The transcript gate is a server-side decision, so this test reads the loader
 * that makes it rather than importing it: `learner-week.ts` is `server-only` and
 * imports the Supabase server client, which cannot be instantiated in a unit
 * test. What matters is that the three properties below are actually in the code
 * and in the order that makes them true.
 */
test('the gate counts saved listening answers for this learner, from the server', () => {
  const gate = learnerWeek.slice(learnerWeek.indexOf('async function loadListeningSupport'));
  assert.ok(gate.length > 0, 'the gate function exists');

  // It reads the saved answers for this user, this week, this skill.
  assert.match(gate, /from\('week_input_answers'\)/);
  assert.match(gate, /\.eq\('user_id', user\.id\)/);
  assert.match(gate, /\.eq\('week_number', weekNumber\)/);
  assert.match(gate, /\.eq\('skill', 'listening'\)/);

  // It uses the request's own Supabase client, so RLS and auth.uid() apply.
  assert.match(gate, /createServerSupabase\(\)/);
  assert.match(gate, /auth\.getUser\(\)/);

  // Unlocked means every authored question has a saved row.
  assert.match(gate, /answered === questions\.length/);
  assert.match(gate, /questions\.length > 0/);
});

test('a locked week sends neither the transcript, the glosses nor the check', () => {
  const gate = learnerWeek.slice(learnerWeek.indexOf('async function loadListeningSupport'));
  for (const field of ['transcript', 'glosses', 'glossCheck']) {
    assert.match(
      gate,
      new RegExp(`${field}: transcriptUnlocked \\? support\\.${field} : null`),
      `${field} must be withheld until unlocked, not merely hidden`,
    );
  }
});

test('an error reading the answers leaves the transcript closed', () => {
  const gate = learnerWeek.slice(learnerWeek.indexOf('async function loadListeningSupport'));
  // The failure path is a catch that leaves the set empty, plus a guard on the
  // query error, so neither an exception nor a rejected query can open the gate.
  assert.match(gate, /catch \{/);
  assert.match(gate, /if \(!saved\.error && saved\.data\)/);
  assert.match(gate, /let answeredIds = new Set<string>\(\);/);
});

test('the listening questions are not exposed with their keys', async () => {
  const { projectSupport, containsPrivateField } = await import('../../lib/curriculum/listening-support.mjs');
  const content = JSON.parse(read('supabase-b1-b2/content/curriculum/listening-support-weeks-01-04.json'));
  for (const week of content.weeks) {
    const script = details.listening.weeks.find((entry) => entry.week === week.week).script;
    const projected = projectSupport(content, week.week, { script });
    assert.equal(containsPrivateField(projected), false, `week ${week.week}`);
  }
});

test('the gloss check never unlocks a week', () => {
  // The unlock rule counts speaking, writing and one input submission. The gloss
  // route writes week_input_answers only, and never week_input_submissions, so it
  // cannot move a learner on.
  const glossRoute = read('src/app/api/week/listening/gloss/route.ts');
  assert.equal(
    glossRoute.includes('week_input_submissions'),
    false,
    'the gloss route must not write a submission row: that is what unlocks the next week',
  );
  assert.match(glossRoute, /from\('week_input_answers'\)/);
});

test('the gloss answer key is not in the route response', () => {
  const glossRoute = read('src/app/api/week/listening/gloss/route.ts');
  const response = glossRoute.slice(glossRoute.indexOf('return NextResponse.json(\n    { correct'));
  assert.ok(response.length > 0, 'the success response is found');
  assert.equal(
    /answerIndex/.test(response.split('headers')[0]),
    false,
    'the response body carries the verdict and the right choice, never the index',
  );
});

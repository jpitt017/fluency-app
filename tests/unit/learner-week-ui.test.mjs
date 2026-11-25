import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const details = JSON.parse(read('supabase-b1-b2/content/curriculum/weeks-01-04-details.json'));

test('the learner page offers a "Step X of 7" bar for vocabulary and "Step X of 5" for grammar', () => {
  const vocabulary = read('components/b1b2/VocabularyPractice.tsx');
  const grammar = read('components/b1b2/GrammarPractice.tsx');
  assert.match(vocabulary, /Step \{current\} of \{total\}: \{label\}/);
  assert.match(vocabulary, /role="progressbar"/);
  assert.match(grammar, /Step \{current\} of \{total\}: \{title\}/);
  assert.match(grammar, /role="progressbar"/);

  // Seven vocabulary steps, five grammar steps.
  const vocabularySteps = vocabulary.match(/const steps = \[([\s\S]*?)\];/)[1].split("',").length;
  assert.equal(vocabularySteps, 7, 'vocabulary keeps its seven steps');
  assert.match(grammar, /total=\{steps\.length\}/);
});

test('vocabulary keeps one short B1 instruction per step', () => {
  const vocabulary = read('components/b1b2/VocabularyPractice.tsx');
  const instructions = vocabulary.match(/const STEP_INSTRUCTIONS = \[([\s\S]*?)\];/)[1]
    .split('\n')
    .map((line) => line.trim().replace(/^'|',?$/g, ''))
    .filter(Boolean);
  assert.equal(instructions.length, 7, 'one instruction per step');
  for (const instruction of instructions) {
    assert.ok(instruction.length <= 80, `too long for a step header: ${instruction}`);
    assert.ok(instruction.endsWith('.'), `not a sentence: ${instruction}`);
  }
});

test('grammar instructions are one short B1 line per step and say nothing about branches', () => {
  const source = read('lib/curriculum/learner-grammar.ts');
  const block = source.match(/const INSTRUCTIONS[\s\S]*?\};/)[0];
  const lines = block
    .split('\n')
    // Keys are quoted when they contain a space and bare when they do not.
    .filter((line) => /^\s+(?:'[^']+'|[A-Za-z]+):\s/.test(line));
  assert.equal(lines.length, 5, 'five steps, five instructions');
  for (const line of lines) {
    assert.ok(line.length < 160);
    assert.ok(!/skip|extra item|below|above|branch|score/i.test(line), `an instruction must not reveal a rule: ${line}`);
  }
});

test('the learner page keeps the listening player main already shipped', () => {
  const page = read('src/app/week/[n]/page.tsx');
  assert.match(page, /ListeningTrialPlayer/);
  assert.match(page, /loadPlayableTrialAudio/);
  assert.match(page, /GrammarPractice/);
  assert.match(page, /VocabularyPractice/);
});

test('the teacher page calls it an extra point, not a light point', () => {
  const panel = read('components/curriculum/WeekDetailPanel.tsx');
  assert.match(panel, />Extra point</);
  assert.ok(!/Light point/.test(panel), 'the old label is gone');
});

test('reading and listening are marked with reasons, one item at a time', () => {
  const route = read('src/app/api/week/input/mark/route.ts');
  const component = read('components/b1b2/WeekInputTask.tsx');
  assert.match(route, /markInputAnswer/);
  assert.match(route, /reason/);
  assert.match(route, /Cache-Control': 'no-store'/);
  assert.match(component, /\/api\/week\/input\/mark/);
  assert.match(component, /marked\.reason/);
  // Checking one answer must not hand back the whole bank.
  assert.ok(!/\bkey\b/.test(route.split('export async function POST')[1].split('return NextResponse.json(\n    { correct: marked.correct')[0].replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '').replace(/item\.key ?=|entry\.id === body\.id/g, '')),
    'the mark route must not read an answer key');
});

test('no learner-facing projection ships a key, accepted answer or reason of another item', () => {
  const week = read('lib/curriculum/learner-week.ts');
  assert.match(week, /projectInputQuestions/);
  for (const item of details.reading.weeks.flatMap((entry) => entry.questions)) {
    assert.ok(!week.includes(item.key) || item.options.includes(item.key), `${item.id} key must not be hard-coded here`);
  }
});

test('a task opened from /week/[n] shows the way back and keeps its week for counting', () => {
  const page = read('src/app/labs/page.tsx');
  // "← Back to Week N" is rendered from the week param, in the page header and
  // in both task sections, so it is on screen even after the #speaking anchor
  // scrolls past the header.
  assert.match(page, /← Back to Week \{weekNumber\}/);
  assert.match(page, /href=\{`\/week\/\$\{weekNumber\}`\}/);
  const backLinkUses = page.match(/\{backToWeek\}/g) ?? [];
  assert.ok(backLinkUses.length >= 2, 'the back link appears at the tasks, not only the header');
  assert.match(page, /This task counts for Week \{weekNumber\}\./);
  // A visitor who signs in from a weekly task returns to that same week.
  assert.match(page, /encodeURIComponent\(weekParam \? `\/labs\?week=\$\{weekNumber\}` : '\/labs'\)/);
  // Keep the week context even if details are unavailable; the marking routes
  // count only a submission that matches a published weekly task.
  assert.match(page, /weekParam \? \{ \.\.\.freeContext, weekNumber \} : freeContext/);
  // The recording and the writing both send the week to their marking route.
  assert.match(read('components/labs/SpeakingLab.tsx'), /form\.set\('weekNumber', String\(lessonContext\.weekNumber\)\)/);
  assert.match(read('components/labs/WritingLab.tsx'), /weekNumber: lessonContext\?\.weekNumber/);
  // And the routes record it against the week's progression.
  assert.match(read('src/app/api/speaking/evaluate/route.ts'), /recordWeekSubmission\(guard\.userId, weekNumber, 'speaking'\)/);
  assert.match(read('src/app/api/writing/correct/route.ts'), /recordWeekSubmission\(guard\.userId, body\.weekNumber, 'writing'\)/);
});

test('free practice keeps its prompt while pronunciation uses the current week', () => {
  const page = read('src/app/labs/page.tsx');
  assert.match(page, /const pronunciationWeek = await loadLearnerWeek\(weekNumber\)/);
  assert.match(page, /const selectedWeek = weekParam \? pronunciationWeek : null/);
  assert.match(page, /targets=\{pronunciationWeek\?\.shadowingChunks\.length/);
  assert.match(page, /audioUrl: chunk\.audioUrl/);
  assert.match(page, /has a short sound/);
  const shadowing = read('components/b1b2/ShadowingLab.tsx');
  assert.match(shadowing, /<span>Listen to the sentence<\/span>/);
  assert.match(shadowing, /aria-describedby=\{useTemporaryVoice \? 'shadowing-temporary-voice' : undefined\}/);
  assert.match(shadowing, /id="shadowing-temporary-voice"[^>]*>Temporary computer voice/);
  assert.match(shadowing, /if \(played === 'tts'\) setModelAudioFailed\(true\)/);
});

test('the week page sends learners to Start speaking/writing task, keeping the week in the URL', () => {
  const page = read('src/app/week/[n]/page.tsx');
  assert.match(page, /href=\{`\/labs\?week=\$\{number\}#speaking`\}[^>]*>Start speaking task</);
  assert.match(page, /href=\{`\/labs\?week=\$\{number\}#writing`\}[^>]*>Start writing task</);
  assert.match(page, /This week&apos;s tasks aren&apos;t ready yet\. You can practise in Practice\./);
});

test('the dashboard shows AI practice as a simple bar with B1 labels', () => {
  const page = read('src/app/dashboard/page.tsx');
  assert.match(page, /Plenty left today/);
  assert.match(page, /Nearly finished for today/);
  assert.match(page, /Finished for today/);
  assert.match(page, /role="progressbar"/);
  assert.match(page, /aria-label="AI practice left today"/);
  assert.match(page, /Your AI practice starts again every night at midnight\. This is Madrid time\./);
  assert.match(read('supabase-b1-b2/migrations/0035_ai_pilot_limits.sql'), /date_trunc\('day', v_now at time zone 'Europe\/Madrid'\)/);
  // The raw units are not a sentence the learner has to do sums with.
  assert.ok(!page.includes('AI practice left today: ${'), 'the old numeric line is gone');
});

test('review explains Again and Easy above the grade buttons', () => {
  const source = read('components/b1b2/ErrorReviewStudio.tsx');
  assert.match(source, /How well did you remember it\? Again = I forgot\. Easy = I knew it at once\./);
  assert.match(source, /Nothing to practise today\. Come back tomorrow!/);
  assert.match(source, /Correct answer/);
});

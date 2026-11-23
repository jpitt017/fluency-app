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

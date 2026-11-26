import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { copiesExample, grammarSentenceCount, hasUnfilledStarter } from '../../lib/curriculum/week-sentence-copy.mjs';
import { projectVocabularyExercises } from '../../lib/curriculum/vocabulary-exercise-projection.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const grammar = JSON.parse(read('supabase-b1-b2/content/curriculum/grammar-use-it-support-weeks-01-04.json'));
const vocabulary = JSON.parse(read('supabase-b1-b2/content/curriculum/vocab-sentence-support-weeks-01-04.json'));
const details = JSON.parse(read('supabase-b1-b2/content/curriculum/weeks-01-04-details.json'));
const bank = JSON.parse(read('supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json'));

const expectedVocabulary = [
  ['V1-S1', 'Write about something that was difficult at first, but now feels normal.', 'I got used to ______ .', 'It took me a long time to get used to the cold weather.'],
  ['V1-S2', 'Write about a decision you made. Are you happy about it now?', "I've never regretted ______ .", 'The biggest challenge was finding a flat.'],
  ['V2-S1', 'Write about a plan you have for this year.', 'This year, I intend to ______ .', "I'm going to save money for a holiday."],
  ['V2-S2', "Write about something you're excited about.", "I'm really looking forward to ______ .", "I'm looking forward to the summer holidays."],
  ['V3-S1', 'Write one rule for a shared flat.', 'We should arrange ______ .', 'We have to keep to a cleaning routine.'],
  ['V3-S2', 'Write about someone you know well.', 'I get on well with ______ because ______ .', "I don't get on with my upstairs neighbour, because he's very noisy."],
  ['V4-S1', 'Write about a place in your town. Say what is done or sold there.', '______ is sold at the local ______ .', 'Local cheese is made in the village near my town.'],
  ['V4-S2', 'Tell a visitor about a custom or tradition in your town.', "In my town, it's a tradition to ______ .", "It's a local custom to eat grapes at midnight on New Year's Eve."],
];

test('each Week 1–4 grammar model and item has its own plain-language support', () => {
  assert.deepEqual(grammar.weeks.map((entry) => entry.week), [1, 2, 3, 4]);
  for (const week of grammar.weeks) {
    assert.ok([2, 3].includes(grammarSentenceCount(week.model)), `Week ${week.week} needs a 2–3 sentence model`);
    const useIt = details.weeks.find((entry) => entry.number === week.week).grammar.practice.items.filter((item) => item.step === 'Use it');
    assert.deepEqual(week.items.map((item) => item.id), useIt.map((item) => item.id));
    for (const item of week.items) {
      assert.ok(item.pattern.trim());
      assert.doesNotMatch(item.pattern, /\b(?:noun|verb|gerund|participle)\b|-ing\b/i);
      assert.ok(item.starters.length >= 2 && item.starters.length <= 3);
      assert.equal(item.examples.length, 1);
      assert.ok([2, 3].includes(grammarSentenceCount(item.examples[0])));
    }
  }
});

test('each weekly model covers both of that week’s Use it targets', () => {
  const [w1, w2, w3, w4] = grammar.weeks.map((entry) => entry.model);
  assert.match(w1, /used to/i);
  assert.match(w1, /since .* have /i);
  assert.match(w2, /going to/i);
  assert.match(w2, /I'm meeting/i);
  assert.match(w2, /if I had.*I would/i);
  assert.match(w3, /have to.*mustn't.*don't have to/i);
  assert.equal((w3.match(/\?/g) ?? []).length, 2);
  assert.match(w4, /was built/i);
  assert.match(w4, /is sold/i);
  assert.match(w4, /quieter than/i);
  assert.match(w4, /friendliest/i);
});

test('vocabulary support preserves every attached prompt, starter and pair of examples', () => {
  assert.equal(vocabulary.status, 'pilot draft: second-teacher review pending');
  assert.equal(vocabulary.items.length, expectedVocabulary.length);
  for (const [id, prompt, starter, secondExample] of expectedVocabulary) {
    const item = vocabulary.items.find((entry) => entry.id === id);
    assert.equal(item?.prompt, prompt, id);
    assert.equal(item?.starter, starter, id);
    assert.equal(item?.examples.length, 2, id);
    assert.equal(item?.examples[1], secondExample, id);
    assert.doesNotMatch(item.pattern, /\b(?:noun|verb|gerund|participle)\b|-ing\b/i);
    const original = bank.weeks.flatMap((week) => week.yourSentence).find((entry) => entry.id === id);
    assert.equal(item.examples[0], original.model, id);
    assert.ok(original.onTargetWhen.trim(), `${id} must keep its existing marking criterion`);
  }
});

test('vocabulary patterns keep the attachment’s wording except plain-language replacements for grammar terminology', () => {
  const patterns = {
    'V1-S1': 'get used to + something / doing something',
    'V1-S2': "I've never regretted + doing something  ·  The biggest challenge was + something",
    'V2-S1': "I intend to ...  ·  I'm going to ...",
    'V2-S2': "I'm looking forward to + something / doing something",
    'V3-S1': "We have to / We don't have to / We should ...  ·  with arrange or routine",
    'V3-S2': 'I get on (well) with + a person',
    'V4-S1': '______ is / are + sold, made, held, built…  ·  and use local',
    'V4-S2': "It's a tradition to ...  ·  It's a local custom to ...",
  };
  for (const item of vocabulary.items) assert.equal(item.pattern, patterns[item.id], item.id);
});

test('the learner projection includes guidance but neither examples nor marking criteria', () => {
  for (const week of bank.weeks) {
    const support = vocabulary.items.filter((entry) => entry.id.startsWith(`V${week.week}-`));
    const projected = projectVocabularyExercises(week, support);
    const json = JSON.stringify(projected);
    for (const item of support) {
      const learnerItem = projected.yourSentence.find((entry) => entry.id === item.id);
      assert.deepEqual(learnerItem, { id: item.id, prompt: item.prompt, pattern: item.pattern, starter: item.starter });
      for (const example of item.examples) assert.ok(!json.includes(example), `${item.id} example leaked before the tap`);
    }
    assert.ok(!json.includes('onTargetWhen'));
  }
});

test('copy detection matches whole examples at word boundaries, even with extra text', () => {
  const example = "I'm looking forward to the summer holidays.";
  assert.equal(copiesExample('  I’M looking forward to the summer holidays! ', [example]), true);
  assert.equal(copiesExample(`Example 2: ${example}`, [example]), true);
  assert.equal(copiesExample(`An example by an imaginary learner ${example}`, [example]), true);
  assert.equal(copiesExample("I'm looking forward to the summer holidays. I will go with my sister.", [example]), true);
  assert.equal(copiesExample(`This is a copy. ${example}`, [example]), true);
  assert.equal(copiesExample("I'm looking forward to the winter holidays.", [example]), false);
  assert.equal(copiesExample("I'm looking forward to summer.", [example]), false);
  assert.equal(copiesExample('I play footballer.', ['I play football.']), false);
  assert.equal(copiesExample('...', [example]), false);
  assert.equal(copiesExample('A personal answer.', ['...']), false);
});

test('grammar validation counts 2–3 sentences and notices unfinished starters', () => {
  assert.equal(grammarSentenceCount('I used to live in Leeds. I live in York now.'), 2);
  assert.equal(grammarSentenceCount('I met Dr. Jones. We still meet every week.'), 2);
  assert.equal(grammarSentenceCount('I used to play\nNow I walk'), 2);
  assert.equal(grammarSentenceCount('One sentence.'), 1);
  assert.equal(grammarSentenceCount('One. Two. Three. Four.'), 4);
  assert.equal(hasUnfilledStarter('I used to ______ . Now I walk.'), true);
  assert.equal(hasUnfilledStarter('I used to run. Now I walk.'), false);
});

test('the example route reveals only the requested example for the correct week and item', async () => {
  const source = read('src/app/api/week/sentence/example/route.ts');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports, URL,
    require(name) {
      if (name === 'next/server') return { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200, headers: init.headers ?? {} }) } };
      if (name === '@/lib/curriculum/week-sentence-support') return { sentenceSupport: (week, id) => {
        if (id.startsWith(`W${week}-`)) return grammar.weeks.find((entry) => entry.week === week)?.items.find((entry) => entry.id === id) ?? null;
        if (id.startsWith(`V${week}-`)) return vocabulary.items.find((entry) => entry.id === id) ?? null;
        return null;
      } };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const get = (query) => exports.GET({ url: `https://test.invalid/api/week/sentence/example?${query}` });
  const first = await get('week=1&id=V1-S1&number=1');
  const second = await get('week=1&id=V1-S1&number=2');
  assert.equal(first.body.example, vocabulary.items[0].examples[0]);
  assert.equal(second.body.example, vocabulary.items[0].examples[1]);
  assert.deepEqual(Object.keys(first.body), ['example']);
  assert.equal((await get('week=1&id=W1-U1&number=1')).body.example, grammar.weeks[0].items[0].examples[0]);
  assert.equal((await get('week=1&id=W1-U1&number=2')).status, 404);
  assert.equal((await get('week=2&id=V1-S1&number=1')).status, 404);
  assert.equal((await get('week=1&id=V1-S1&number=3')).status, 404);
});

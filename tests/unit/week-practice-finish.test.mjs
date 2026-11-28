import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

import {
  canFinish,
  completionCounts,
  finishHint,
  firstUnfinishedStep,
  grammarItemFlags,
  resumeStep,
  nextTaskAfter,
  practiceCounts,
  practiceScoreBand,
  summarySentence,
  unmarkedRequired,
  vocabularyItemFlags,
} from '../../lib/curriculum/week-practice.mjs';
import { practiceErrorCard } from '../../lib/curriculum/week-practice-review.mjs';

/**
 * Finishing grammar and vocabulary on /week/[n].
 *
 * The rules are pure, so they are tested here rather than through a browser: a
 * 500-response run cannot tell whether a score was counted from the saved rows
 * or from a number the browser sent. What follows pins the numbers the summary
 * can show, which items count, and where each section can be finished from.
 */

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const details = JSON.parse(read('supabase-b1-b2/content/curriculum/weeks-01-04-details.json'));
const vocabularyBank = JSON.parse(read('supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json'));

/** Week 1's learner grammar, projected the way the page does it. */
function weekOneGrammarItems() {
  const items = details.weeks[0].grammar.practice.items;
  return items.map((item) => ({
    id: item.id,
    needsAi: item.step === 'Rewrite' || item.step === 'Use it',
    target: item.target ?? 'Main',
  }));
}

test('grammar counts 22 fixed questions in week 1, which is the number the brief quotes', () => {
  const planned = weekOneGrammarItems().map((item) => ({ id: item.id, ...grammarItemFlags(item) }));
  const counted = planned.filter((item) => item.counted);
  assert.equal(counted.length, 22);
  // Three Meaning, six Choose, five Complete, three Fix, three Light, two Review.
  const byStep = {};
  for (const item of planned.filter((entry) => entry.counted)) {
    const authored = details.weeks[0].grammar.practice.items.find((entry) => entry.id === item.id);
    byStep[authored.step] = (byStep[authored.step] ?? 0) + 1;
  }
  assert.deepEqual(byStep, { Meaning: 3, Choose: 6, Complete: 5, Fix: 3, Light: 3, 'Review (clinic)': 2 });
});

test('the app-marked and Extra grammar items never block finishing', () => {
  for (const item of weekOneGrammarItems()) {
    const flags = grammarItemFlags(item);
    if (item.needsAi || item.target === 'Extra') {
      assert.equal(flags.optional, true, `${item.id} must be optional`);
      assert.equal(flags.counted, false, `${item.id} must not be in the score`);
    } else {
      assert.equal(flags.optional, false, `${item.id} must be required`);
      assert.equal(flags.counted, true, `${item.id} must be counted`);
    }
  }
  // Rewrite and Use it are in every week, and all of them are optional.
  for (const week of details.weeks) {
    const appMarked = week.grammar.practice.items.filter((item) => item.step === 'Rewrite' || item.step === 'Use it');
    assert.ok(appMarked.length === 5, `Week ${week.number} should carry five app-marked items`);
  }
});

test('vocabulary step 7 is optional and steps 2-6 are counted', () => {
  assert.equal(vocabularyItemFlags(0).counted, false, 'the word cards ask nothing');
  assert.equal(vocabularyItemFlags(0).optional, false);
  for (const step of [1, 2, 3, 4, 5]) {
    assert.equal(vocabularyItemFlags(step).counted, true, `step ${step + 1} has fixed answers`);
    assert.equal(vocabularyItemFlags(step).optional, false, `step ${step + 1} is required`);
  }
  assert.equal(vocabularyItemFlags(6).optional, true, 'step 7 is the learner writing their own sentences');
  assert.equal(vocabularyItemFlags(6).counted, false);
});

test('vocabulary week 1 counts 16 fixed questions', () => {
  const week = vocabularyBank.weeks[0];
  const perStep = [week.match.items.length, week.text.items.length, week.chooseVerb.length + week.wordForms.length, week.typeTheWord.items.length];
  assert.equal(perStep.reduce((total, value) => total + value, 0), 16);
});

test('score bands use checked answers and the exact 50% and 80% thresholds', () => {
  for (const [answered, correct, band] of [
    [0, 0, 'none'],
    [1, 0, 'low'],
    [100, 49, 'low'],
    [20000, 9999, 'low'], // 49.995% must not round up
    [2, 1, 'middle'],     // exactly 50%
    [100, 79, 'middle'],
    [10000, 7999, 'middle'], // 79.99% must not round up
    [5, 4, 'high'],       // exactly 80%
    [22, 22, 'high'],
  ]) {
    assert.equal(practiceScoreBand({ answered, correct }), band, `${correct} of ${answered}`);
  }
});

test('grammar and vocabulary summaries keep counts, give the matching advice, and mention unanswered items', () => {
  assert.equal(
    summarySentence({ answered: 100, correct: 49, total: 100, skill: 'grammar' }),
    "You answered 100 of 100. 49 were right. This grammar is new for you. That's OK! Read the examples again, then practise the questions you got wrong.",
  );
  assert.equal(
    summarySentence({ answered: 5, correct: 0, total: 16, skill: 'vocabulary' }),
    "You answered 5 of 16. 0 were right. These words are new for you. That's OK! Look at the words again, then practise them. You can come back and finish the other questions.",
  );
  for (const skill of ['grammar', 'vocabulary']) {
    assert.equal(
      summarySentence({ answered: 2, correct: 1, total: 22, skill }),
      'You answered 2 of 22. 1 was right. Good effort! Your mistakes are in Review, so you can practise them. You can come back and finish the other questions.',
    );
    assert.match(summarySentence({ answered: 100, correct: 79, total: 100, skill }), /Good effort!/);
    assert.match(summarySentence({ answered: 4, correct: 3, total: 4, skill, reviewReady: false }),
      /Good effort! Press Finish again to add your mistakes to Review\./);
    assert.doesNotMatch(summarySentence({ answered: 5, correct: 0, total: 5, skill, reviewReady: false }),
      /mistakes are in Review/);
  }
  assert.equal(
    summarySentence({ answered: 5, correct: 4, total: 22, skill: 'grammar' }),
    'You answered 5 of 22. 4 were right. Great work! You know this grammar well. You can come back and finish the other questions.',
  );
  assert.equal(
    summarySentence({ answered: 16, correct: 16, total: 16, skill: 'vocabulary' }),
    'You answered 16 of 16. 16 were right. Great work! You know these words well.',
  );
  assert.equal(
    summarySentence({ answered: 0, correct: 0, total: 22 }),
    'You answered 0 of 22. 0 were right. Answer and check a question to see your score. You can come back and finish the other questions.',
  );
});

test('the Finish panel warns about incomplete Review and later answers', () => {
  // Render the real client component without a browser or a live database.
  const compiled = ts.transpileModule(read('components/b1b2/PracticeFeedback.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  const Link = ({ children, href, className }) => React.createElement('a', { href, className }, children);
  runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return jsxRuntime;
      if (name === 'next/link') return Link;
      if (name === '@/lib/curriculum/week-practice.mjs') return { practiceScoreBand };
      if (name === '@/lib/curriculum/week-tasks.mjs') return { ACTION_BUTTON_CLASS: '' };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });

  for (const skill of ['grammar', 'vocabulary']) {
    const props = { title: 'Finished', skill, nextLabel: 'Next', nextHref: '#next', onRevisit() {} };
    const counts = { answered: 2, correct: 1, wrong: 1, total: skill === 'grammar' ? 22 : 16 };
    const incomplete = renderToStaticMarkup(React.createElement(exports.FinishSummary, {
      ...props,
      summary: { ...counts, reviewMistakes: 0, sentence: summarySentence({ ...counts, skill, reviewReady: false }) },
    }));
    assert.match(incomplete, /Press Finish again to add your mistakes to Review/);
    assert.match(incomplete, /Some mistakes may not be in Review yet/);
    assert.doesNotMatch(incomplete, /Your mistakes are in Review/);

    const lowCounts = { ...counts, correct: 0, wrong: 2 };
    const incompleteLow = renderToStaticMarkup(React.createElement(exports.FinishSummary, {
      ...props,
      summary: { ...lowCounts, reviewMistakes: 0, sentence: summarySentence({ ...lowCounts, skill, reviewReady: false }) },
    }));
    assert.match(incompleteLow, /Some mistakes may not be in Review yet/);
    assert.match(incompleteLow, /href="\/review"/);
    assert.doesNotMatch(incompleteLow, /Your mistakes are in Review/);

    const stale = renderToStaticMarkup(React.createElement(exports.FinishSummary, {
      ...props,
      summary: { ...counts, reviewMistakes: 1, sentence: summarySentence({ ...counts, skill }), scoreNeedsRefresh: true },
    }));
    assert.match(stale, /Your latest answers may not match this score/);
    assert.match(stale, /New mistakes may not be in Review yet/);
  }
});

test('a checked fixed answer enables a partial finish, but optional work alone does not', () => {
  const items = [
    { id: 'a', optional: false, counted: true },
    { id: 'b', optional: false, counted: true },
    { id: 'c', optional: true, counted: false },
  ];
  assert.equal(canFinish(items, {}), false);
  assert.equal(canFinish(items, { c: true }), false);
  assert.equal(canFinish(items, { a: true }), true);
  assert.equal(canFinish(items, { b: false }), true, 'a wrong mark is still an answer');
  assert.equal(unmarkedRequired(items, { a: true }).length, 1);
  assert.equal(finishHint(items, { c: true }), 'Answer and check at least 1 question to finish.');
  assert.equal(finishHint(items, { a: true }), null);
});

test('a reload starts at the first unfinished step, not at step 1', () => {
  const steps = [
    { title: 'See it', items: [{ id: 'a' }] },
    { title: 'Practise', items: [{ id: 'b' }, { id: 'c' }] },
    { title: 'Fix it', items: [{ id: 'd' }] },
  ];
  assert.equal(firstUnfinishedStep(steps, {}), 0);
  assert.equal(firstUnfinishedStep(steps, { a: true }), 1);
  assert.equal(firstUnfinishedStep(steps, { a: true, b: false }), 1, 'a wrong answer is still answered');
  assert.equal(firstUnfinishedStep(steps, { a: true, b: true, c: false }), 2);
  // Everything answered: the page opens at the end, where Finish lives, rather
  // than dropping the learner back at the start of a finished section.
  assert.equal(firstUnfinishedStep(steps, { a: true, b: true, c: false, d: true }), 0);
});

test('a reload opens at the section start before anything is done, and at Finish when it is', () => {
  const steps = [
    { title: 'Words', items: [] },
    { title: 'Match', items: [{ id: 'b', optional: false }] },
    { title: 'Sentences', items: [{ id: 'c', optional: true }] },
  ];
  assert.equal(resumeStep(steps, {}), 0, 'a first-time learner starts at the word cards');
  assert.equal(resumeStep(steps, { b: true }), 2, 'required work done: the optional step is where they left off');
  assert.equal(resumeStep(steps, { b: false }), 2);
  assert.equal(resumeStep(steps, { b: true, c: true }), 2, 'everything done: Finish is on screen');
});

test('right plus wrong equals answered, excluding optional, unanswered and unknown items', () => {
  const items = [
    { id: 'a', optional: false, counted: true },
    { id: 'b', optional: false, counted: true },
    { id: 'c', optional: false, counted: true },
    { id: 'd', optional: true, counted: false },
  ];
  const counts = practiceCounts(items, { a: true, b: false, d: false, unknown: true });
  assert.deepEqual(counts, { total: 3, answered: 2, correct: 1, wrong: 1 });
  assert.equal(counts.correct + counts.wrong, counts.answered);
});

test('saved partial snapshots reload unchanged and old optional counts are capped', () => {
  assert.deepEqual(completionCounts({ total: 22, answered: 7, correct: 6 }), {
    total: 22, answered: 7, correct: 6, wrong: 1,
  });
  // Old Finish required all 22, but stored optional answers in `answered` too.
  assert.deepEqual(completionCounts({ total: 22, answered: 25, correct: 6 }), {
    total: 22, answered: 22, correct: 6, wrong: 16,
  });
  assert.deepEqual(completionCounts({ total: 0, answered: 25, correct: 6 }, 22), {
    total: 22, answered: 22, correct: 6, wrong: 16,
  });
});

test('a wrong multi-blank answer gets a usable Review card with full corrected sentence and rule', () => {
  const item = details.weeks[0].grammar.practice.items.find((entry) => entry.id === 'W1-C5');
  const card = practiceErrorCard({ userId: 'learner', item, answer: 'Did ... live', category: 'tense' });
  assert.equal(card.prompt_sentence, '___ you ever ___ in another country?');
  assert.equal(card.corrected_sentence, 'Have you ever lived in another country?');
  assert.equal(card.card_format, 'cloze');
  assert.ok(card.explanation && !/^Write the sentence again/.test(card.explanation));
  const week4 = details.weeks[3].grammar.practice.items.find((entry) => entry.id === 'W4-G5');
  const arrayCard = practiceErrorCard({ userId: 'learner', item: week4, answer: ['is', 'make'], category: 'tense' });
  assert.equal(arrayCard.prompt_sentence, 'Where ___ your car ___ (make)?');
  assert.equal(arrayCard.corrected_sentence, 'Where was your car made?');
  assert.equal(arrayCard.card_format, 'cloze');
});

test('meaning questions with one-word answers do not create broken single-word Review cards', () => {
  let questions = 0;
  for (const week of details.weeks) {
    for (const item of week.grammar.practice.items.filter((entry) => entry.step === 'Meaning')) {
      questions += 1;
      const wrong = item.options.find((option) => option !== item.key);
      const card = practiceErrorCard({ userId: 'learner', item, answer: wrong, category: 'tense' });
      assert.equal(card, null, `${item.id} must not create a single-word Review card`);
    }
  }
  assert.equal(questions, 12);
  const reviewUi = read('components/b1b2/ErrorReviewStudio.tsx');
  assert.match(reviewUi, /Answer this question without hints:/);
  assert.match(reviewUi, /isQuestion \? 'Your answer' : 'Your corrected sentence'/);
});

test('verb and word-form mistakes create full-sentence Review cards with options preserved', () => {
  const item = vocabularyBank.weeks[0].chooseVerb[0];
  const card = practiceErrorCard({
    userId: 'learner',
    item: { prompt: item.question, key: item.options[item.answer_index], options: item.options, reason: item.reason },
    answer: 'made',
    category: 'collocation',
  });
  assert.equal(card.prompt_sentence, 'I ___ a risk and applied for a job abroad.');
  assert.equal(card.corrected_sentence, 'I took a risk and applied for a job abroad.');
  assert.equal(card.card_format, 'cloze');
  assert.equal(card.explanation, item.reason);
});

test('grammar points at vocabulary when there is one, and the sections have anchors', () => {
  assert.deepEqual(nextTaskAfter('grammar', { hasVocabulary: true }), {
    label: 'Next: Vocabulary →',
    href: '#vocabulary-practice',
  });
  assert.deepEqual(nextTaskAfter('vocabulary'), { label: 'Next: Reading →', href: '#reading-practice' });
  assert.deepEqual(nextTaskAfter('grammar', { hasVocabulary: false }).href, '#reading-practice');

  const page = read('src/app/week/[n]/page.tsx');
  assert.match(page, /<GrammarPractice/);
  assert.match(page, /<VocabularyPractice/);
  // The anchors in nextTaskAfter must exist, or the button lands nowhere. The
  // accordion renders each section with `id={task.anchor}`, so the anchors live
  // in the shared task map and the layout has to use them.
  const taskMap = read('lib/curriculum/week-tasks.mjs');
  for (const anchor of ['grammar-practice', 'vocabulary-practice', 'reading-practice', 'listening-practice', 'speaking-practice', 'writing-practice']) {
    assert.ok(taskMap.includes(`anchor: '${anchor}'`), `week-tasks.mjs has no ${anchor} anchor`);
  }
  const layout = read('components/b1b2/WeekTaskLayout.tsx');
  assert.match(layout, /id=\{task\.anchor\}/);
});

test('the components finish rather than disabling Next on the last step', () => {
  const grammar = read('components/b1b2/GrammarPractice.tsx');
  const vocabulary = read('components/b1b2/VocabularyPractice.tsx');
  for (const [file, label] of [
    [grammar, 'Finish grammar'],
    [vocabulary, 'Finish vocabulary'],
  ]) {
    assert.match(file, new RegExp(`'${label}'|>\\s*${label}\\s*<`), `${file} has no ${label} button`);
    // The old dead end: a Next button disabled on the last step.
    assert.doesNotMatch(file, /disabled=\{step === steps\.length - 1\}/, `${file} still disables Next`);
    assert.doesNotMatch(file, /disabled=\{index === steps\.length - 1\}/, `${file} still disables Next`);
    assert.match(file, /\/api\/week\/practice\/finish/, `${file} does not call the finish route`);
  }
  // Neither one shows a summary before a completion exists.
  assert.match(grammar, /\{summary && \(/);
  assert.match(vocabulary, /\{summary && \(/);
});

test('a checked answer says it was saved, in both sections', () => {
  const feedback = read('components/b1b2/PracticeFeedback.tsx');
  assert.match(feedback, /Saved ✓/);
  // Announced, not just drawn: role="status" is what makes a screen reader say it.
  assert.match(feedback, /role="status"[\s\S]*Saved/);
  for (const file of ['components/b1b2/GrammarPractice.tsx', 'components/b1b2/VocabularyPractice.tsx']) {
    assert.match(read(file), /<SavedTick/, `${file} shows no saved line`);
  }
});

test('the saved view is server-side, and the score is never taken from the browser', () => {
  const progress = read('lib/curriculum/week-practice-progress.ts');
  assert.match(progress, /week_grammar_attempts/);
  assert.match(progress, /week_vocabulary_attempts/);
  assert.match(progress, /week_skill_completions/);
  // The adaptive rules are applied to restored results, not only to clicks.
  assert.match(read('components/b1b2/GrammarPractice.tsx'), /visibleItems\(step, steps, results\)/);

  const route = read('src/app/api/week/practice/finish/route.ts');
  const finish = read('lib/curriculum/week-practice-finish.ts');
  // Nothing in the body can set a count: the route accepts a week and a skill.
  assert.doesNotMatch(route, /body\.(correct|total|score|review)\b/);
  assert.match(finish, /readPracticeAttempts\(admin, TABLES\[skill\]/);
  assert.match(finish, /item\.counted && results\[item\.id\] === false/);
  const feedback = read('components/b1b2/PracticeFeedback.tsx');
  assert.doesNotMatch(feedback, /of \{summary\.total\} right|to practise in Review|Nothing new to review/);
  assert.doesNotMatch(read('lib/curriculum/week-practice.mjs'), /Well done!|You got/);
});

test('completion records are included in "Delete my data"', () => {
  const migration = read('supabase-b1-b2/migrations/0049_week_skill_completions.sql');
  assert.match(migration, /create table if not exists public\.week_skill_completions/);
  assert.match(migration, /delete from public\.week_skill_completions where user_id = \$1/);
  // The additive pattern every deletion branch since 0041 uses.
  assert.match(migration, /if position\('public\.week_skill_completions' in definition\) = 0 then/);
  // And the replay fixture, or the coverage loop would fail for want of a row.
  assert.match(read('tests/database/delete-learning-data.sql'), /week_skill_completions/);
});

test('finishing does not change which week is open', () => {
  const migration = read('supabase-b1-b2/migrations/0049_week_skill_completions.sql');
  assert.doesNotMatch(migration, /create or replace function public\.refresh_current_week/);
  assert.doesNotMatch(migration, /week_input_submissions/);
  const finish = read('lib/curriculum/week-practice-finish.ts');
  assert.doesNotMatch(finish, /week_input_submissions|week_output_submissions/);
});

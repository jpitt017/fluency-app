import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  canFinish,
  completionCounts,
  finishHint,
  firstUnfinishedStep,
  grammarItemFlags,
  resumeStep,
  nextTaskAfter,
  practiceCounts,
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

test('partial summaries use checked answers as the score denominator and the exact thresholds', () => {
  const high = summarySentence({ answered: 5, correct: 4, total: 22 }); // exactly 80%
  assert.equal(high, 'You answered 5 of 22. 4 were right. Great work! You can come back and finish the other questions.');
  assert.equal(
    summarySentence({ answered: 7, correct: 6, total: 22 }),
    'You answered 7 of 22. 6 were right. Great work! You can come back and finish the other questions.',
  );
  assert.equal(
    summarySentence({ answered: 4, correct: 3, total: 22 }),
    'You answered 4 of 22. 3 were right. Good effort! Your mistakes are in Review, so you can practise them. You can come back and finish the other questions.',
  );
  assert.match(summarySentence({ answered: 2, correct: 1, total: 22 }), /1 was right\. Good effort!/); // exactly 50%
  assert.match(summarySentence({ answered: 100, correct: 79, total: 100 }), /Good effort!/); // not rounded up
  assert.match(summarySentence({ answered: 4, correct: 3, total: 4, reviewReady: false }), /Good effort! Press Finish again to add your mistakes to Review\./);
  assert.match(summarySentence({ answered: 100, correct: 49, total: 100 }), /This grammar is new\. Look at 'See it' again, then try your Review cards\./);
  assert.match(summarySentence({ answered: 5, correct: 0, total: 16, skill: 'vocabulary' }), /This vocabulary is new\. Look at 'Words' again, then try your Review cards\./);
  const complete = summarySentence({ answered: 22, correct: 22, total: 22 });
  assert.equal(complete, 'You answered 22 of 22. 22 were right. Great work!');
  assert.doesNotMatch(complete, /come back/);
  assert.match(summarySentence({ answered: 0, correct: 0, total: 22 }), /Answer and check a question to see your score\./);
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

test('a wrong multi-blank answer gets a usable Review card, not a silently dropped key', () => {
  const item = details.weeks[0].grammar.practice.items.find((entry) => entry.id === 'W1-C5');
  const card = practiceErrorCard({ userId: 'learner', item, answer: 'Did ... live', category: 'tense' });
  assert.equal(card.prompt_sentence, 'Did you ever live in another country?');
  assert.equal(card.corrected_sentence, 'Have you ever lived in another country?');
  assert.match(card.explanation, /Have \.\.\. lived/);
  const week4 = details.weeks[3].grammar.practice.items.find((entry) => entry.id === 'W4-G5');
  const arrayCard = practiceErrorCard({ userId: 'learner', item: week4, answer: ['is', 'make'], category: 'tense' });
  assert.equal(arrayCard.prompt_sentence, 'Where is your car make?');
  assert.equal(arrayCard.corrected_sentence, 'Where was your car made?');
});

test('meaning questions in all four weeks become answerable Review questions, not broken sentence fixes', () => {
  let questions = 0;
  for (const week of details.weeks) {
    for (const item of week.grammar.practice.items.filter((entry) => entry.step === 'Meaning')) {
      questions += 1;
      const wrong = item.options.find((option) => option !== item.key);
      const card = practiceErrorCard({ userId: 'learner', item, answer: wrong, category: 'tense' });
      assert.equal(card.prompt_sentence, `Answer this question: ${item.prompt}`);
      assert.equal(card.corrected_sentence, item.key);
      assert.notEqual(card.prompt_sentence, card.corrected_sentence);
      assert.match(card.explanation, /The answer is/);
    }
  }
  assert.equal(questions, 12);
  const reviewUi = read('components/b1b2/ErrorReviewStudio.tsx');
  assert.match(reviewUi, /Answer this question without hints:/);
  assert.match(reviewUi, /isQuestion \? 'Your answer' : 'Your corrected sentence'/);
});

test('verb and word-form mistakes can use a repair card without inventing a vocabulary alias', () => {
  const item = vocabularyBank.weeks[0].chooseVerb[0];
  const card = practiceErrorCard({
    userId: 'learner', item: { prompt: item.question, key: item.options[item.answer_index] },
    answer: 'made', category: 'collocation',
  });
  assert.equal(card.prompt_sentence, 'I made a risk and applied for a job abroad.');
  assert.equal(card.corrected_sentence, 'I took a risk and applied for a job abroad.');
});

test('grammar points at vocabulary when there is one, and the sections have anchors', () => {
  assert.deepEqual(nextTaskAfter('grammar', { hasVocabulary: true }), {
    label: 'Next: Vocabulary →',
    href: '#vocabulary-practice',
  });
  assert.deepEqual(nextTaskAfter('vocabulary'), { label: 'Next: Reading →', href: '#reading-practice' });
  assert.deepEqual(nextTaskAfter('grammar', { hasVocabulary: false }).href, '#reading-practice');

  const page = read('src/app/week/[n]/page.tsx');
  assert.match(page, /id="reading-practice"/);
  assert.match(page, /<GrammarPractice/);
  assert.match(page, /<VocabularyPractice/);
  for (const file of ['components/b1b2/GrammarPractice.tsx', 'components/b1b2/VocabularyPractice.tsx']) {
    // The anchor in nextTaskAfter must exist, or the button lands nowhere.
    const component = read(file);
    assert.match(component, /id="grammar-practice"|id="vocabulary-practice"/, `${file} has no anchor`);
  }
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
  assert.match(read('components/b1b2/GrammarPractice.tsx'), /visibleItems\(current, steps, results\)/);

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

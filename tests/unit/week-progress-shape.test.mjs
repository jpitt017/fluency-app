import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeWeekProgress } from '../../lib/curriculum/week-progress-shape.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('all six task types report saved counts, completion and estimated minutes', () => {
  const progress = makeWeekProgress({
    completions: [{ skill: 'grammar' }, { skill: 'vocabulary' }],
    grammarItemIds: ['g1', 'g1', 'g2'],
    vocabularyItemIds: ['v1', 'v2'],
    grammarQuestionIds: ['g1', 'g2'],
    vocabularyQuestionIds: ['v1', 'v2'],
    inputSubmissions: [{ skill: 'reading' }],
    inputAnswers: [
      { skill: 'reading', item_id: 'r1' },
      { skill: 'reading', item_id: 'r1' },
      { skill: 'reading', item_id: 'gloss-r1' },
      { skill: 'listening', item_id: 'l1' },
      { skill: 'listening', item_id: 'l2' },
      { skill: 'listening', item_id: 'l3' },
      { skill: 'listening', item_id: 'l4' },
      { skill: 'listening', item_id: 'l5' },
      { skill: 'listening', item_id: 'l6' },
      { skill: 'listening', item_id: 'l7' },
      { skill: 'listening', item_id: 'l8' },
      { skill: 'listening', item_id: 'l9' },
      { skill: 'listening', item_id: 'l10' },
    ],
    outputSubmissions: [{ skill: 'speaking' }],
    speakingRecordings: 1,
    writingSubmissions: 1,
    readingQuestionIds: Array.from({ length: 10 }, (_, index) => `r${index + 1}`),
    listeningQuestionIds: Array.from({ length: 10 }, (_, index) => `l${index + 1}`),
    readingTotal: 10,
    listeningTotal: 10,
    grammarTotal: 10,
    vocabularyTotal: 10,
  });
  assert.deepEqual(Object.keys(progress), ['grammar', 'vocabulary', 'reading', 'listening', 'speaking', 'writing']);
  assert.equal(progress.grammar.itemsAnswered, 2, 'repeated attempts count one item');
  assert.equal(progress.grammar.done, true);
  assert.equal(progress.vocabulary.itemsAnswered, 2);
  assert.equal(progress.reading.done, true, 'explicit input completion is recognized');
  assert.equal(progress.reading.itemsAnswered, 1, 'gloss attempts and repeated marks are not counted as task questions');
  assert.equal(progress.listening.done, true, 'all ten persisted answers cover a missing completion marker');
  assert.equal(progress.listening.itemsAnswered, 10);
  assert.equal(progress.speaking.itemsAnswered, 1);
  assert.equal(progress.speaking.done, true);
  assert.equal(progress.writing.done, true);
  assert.equal(progress.writing.minutes, 10);
  assert.equal(progress.listening.minutes, 8);
});

test('dashboard and week overview share the new loader instead of legacy lesson progress', () => {
  const dashboard = read('src/app/dashboard/page.tsx');
  const week = read('src/app/week/[n]/page.tsx');
  const home = read('src/app/page.tsx');
  const data = read('lib/b1b2/data.ts');
  assert.match(dashboard, /loadWeekProgress\(data\.userId, weekNumber\)/);
  assert.match(week, /loadWeekProgress\(viewer\.user\?\.id \?\? null, number\)/);
  assert.match(home, /loadWeekProgress\(userId, week\)/);
  for (const source of [dashboard, home, data]) {
    assert.doesNotMatch(source, /get_learner_dashboard|lesson_progress|skill_levels|weekly_reports/);
  }
  assert.match(dashboard, /cards due today/);
  assert.match(dashboard, /cards finished/);
});

test('partial progress is not marked complete and minutes are prorated estimates', () => {
  const progress = makeWeekProgress({
    inputAnswers: [{ skill: 'listening', item_id: 'l1' }, { skill: 'listening', item_id: 'l2' }],
    listeningQuestionIds: Array.from({ length: 10 }, (_, index) => `l${index + 1}`),
    listeningTotal: 10,
  });
  assert.deepEqual(progress.listening, { done: false, itemsAnswered: 2, minutes: 2 });
  assert.deepEqual(progress.writing, { done: false, itemsAnswered: 0, minutes: 0 });
});

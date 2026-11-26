import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { projectInputQuestions } from '../../lib/curriculum/input-marking.mjs';

const source = readFileSync(new URL('../../lib/curriculum/syllabus-cache.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const exports = {};
const cacheOptions = [];
runInNewContext(compiled, {
  exports,
  require(name) {
    if (name === 'server-only') return {};
    if (name === 'next/cache') return { unstable_cache: (fn, keys, options) => {
      cacheOptions.push({ keys, options });
      return (...args) => fn(...args);
    } };
    if (name === './input-marking.mjs') return { projectInputQuestions };
    if (name === '@/utils/supabase/admin') return { createAdminSupabase: () => null };
    throw new Error(`Unexpected dependency: ${name}`);
  },
});

test('detail cache allowlists learner content and drops model answers and grammar keys', () => {
  const result = exports.projectSafeWeekDetails({
    title: 'Week title',
    canDo: 'Tell a story',
    speaking: {
      prompt: 'Speak about a change',
      cueCard: 'Before · Now',
      flow: { record: '60-90 seconds', modelAnswer: 'secret' },
      model: 'secret',
      shadowingChunks: [{ chunk: 'A short line', listenFor: 'linking', key: 'secret', answer: 'secret' }],
    },
    writing: { prompt: 'Write a story', modelAnswer: 'secret' },
    grammar: { practice: { items: [{ key: 'secret', accepted: ['secret'], reason: 'secret' }] } },
    answer: 'secret',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    title: 'Week title',
    canDo: 'Tell a story',
    speaking: {
      prompt: 'Speak about a change',
      cueCard: 'Before · Now',
      record: '60-90 seconds',
      shadowingChunks: [{ chunk: 'A short line', listenFor: 'linking' }],
    },
    writing: { prompt: 'Write a story' },
  });
  assert.doesNotMatch(JSON.stringify(result), /secret|answer|accepted|reason/i);
});

test('input-item cache projects questions only, never answer material', () => {
  const result = exports.projectSafeInputQuestion({
    id: 'q1', question: 'Which option?', options: ['A', 'B'], key: 'B',
    accepted: ['B'], reason: 'secret', model: 'secret', answer_index: 1,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { id: 'q1', question: 'Which option?', options: ['A', 'B'] });
  assert.doesNotMatch(JSON.stringify(result), /key|answer|accepted|reason|model/i);
});

test('syllabus-week cache preserves only typed learner-facing fields', () => {
  const result = exports.projectSafeSyllabusWeek({
    week_number: 4, stage_number: 1, phase: 'phase', theme: 'theme', main_grammar: 'grammar',
    secondary_grammar_label: 'recycle', secondary_grammar: 'past', skills_focus: 'all',
    cefr: { canDo: 'can do', scale: 'scale', level: 'B1', answer: 'secret' },
    grammar: { stretch: true, structures: 'form', marking: 'rubric', key: 'secret' },
    mediation: {
      prompt: 'share an idea', source: 'audio', output: 'summary', scale: 'scale', level: 'B1',
      time: '10 min', requirement: 'optional', requirementKind: 'optional', countsTowardsUnlocking: false,
      feedback: 'feedback', answer: 'secret',
    },
    modelAnswer: 'secret',
  });
  assert.equal(result.week_number, 4);
  assert.equal(result.cefr.canDo, 'can do');
  assert.equal(result.grammar.marking, 'rubric');
  assert.equal(result.mediation.prompt, 'share an idea');
  assert.doesNotMatch(JSON.stringify(result), /secret|modelAnswer|answer"/i);
});

test('all shared syllabus caches expire after one hour and take the week in their cache key', () => {
  assert.equal(cacheOptions.length, 3);
  for (const cache of cacheOptions) {
    assert.equal(cache.options.revalidate, 3600);
    assert.ok(cache.keys.length > 0);
  }
});

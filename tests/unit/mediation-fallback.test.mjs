import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolveMediation } from '../../lib/curriculum/mediation-fallback.ts';

const syllabus = JSON.parse(readFileSync(new URL('../../supabase-b1-b2/content/curriculum/two-stage-syllabus.json', import.meta.url)));

test('empty non-mediation weeks do not warn, checkpoint weeks warn and fall back', () => {
  for (const week of syllabus.weeks) {
    for (const missing of [null, {}]) {
      const warnings = [];
      const result = resolveMediation(week.number, missing, week.mediation, (message) => warnings.push(message));
      assert.equal(result, week.mediation);
      if (week.number % 4 === 0) {
        assert.ok(week.mediation, `week ${week.number} should have a bundled task`);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], new RegExp(`Week ${week.number}:.*using bundled content`));
      } else {
        assert.equal(warnings.length, 0, `unexpected warning for week ${week.number}`);
      }
    }
  }
});

test('published tasks are retained without warning; missing checkpoint fallback is reported accurately', () => {
  const warnings = [];
  const warn = (message) => warnings.push(message);
  const published = { task: 'published' };
  assert.equal(resolveMediation(4, published, { task: 'bundled' }, warn), published);
  assert.equal(warnings.length, 0);
  assert.equal(resolveMediation(8, null, undefined, warn), undefined);
  assert.match(warnings[0], /no bundled task is available/);
});

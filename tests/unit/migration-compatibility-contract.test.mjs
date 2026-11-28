import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateEvidence } from '../../scripts/check-migration-compatibility.mjs';

const path = 'supabase-b1-b2/migrations/0090_example.sql';
const old = 'tests/unit/old-app-compat.test.mjs';
const next = 'tests/unit/new-app-compat.test.mjs';
const valid = { '0090_example.sql': { old_app_new_schema: [old], new_app_old_schema: [next], overlap_notes: 'No known overlap risk.' } };
const exists = (name) => [old, next].includes(name);

test('each changed migration must name runnable evidence for both app/schema directions', () => {
  assert.deepEqual(validateEvidence([{ status: 'A', path }], valid, exists), [next, old]);
  assert.throws(() => validateEvidence([{ status: 'A', path }], {}, exists), /Missing compatibility evidence/);
  assert.throws(() => validateEvidence([{ status: 'A', path }], { '0090_example.sql': { ...valid['0090_example.sql'], new_app_old_schema: [] } }, exists), /new_app_old_schema/);
  assert.throws(() => validateEvidence([{ status: 'A', path }], { '0090_example.sql': { ...valid['0090_example.sql'], old_app_new_schema: ['tests/unit/missing.test.mjs'] } }, exists), /missing executable/);
  assert.throws(() => validateEvidence([{ status: 'D', path }], valid, exists), /Do not delete/);
});

test('the standing rule and 0081 exception are explicit, and its registered test files exist', () => {
  const instructions = readFileSync('AGENTS.md', 'utf8');
  assert.match(instructions, /old app must keep working with the new\s+schema/);
  assert.match(instructions, /new app must keep working with the old schema/);
  const manifest = JSON.parse(readFileSync('tests/migration-compatibility.json', 'utf8'));
  const paths = validateEvidence([{ status: 'A', path: 'supabase-b1-b2/migrations/0081_retryable_learning_data_deletion.sql' }], manifest, (file) => {
    try { readFileSync(file); return true; } catch { return false; }
  });
  assert.ok(paths.includes('tests/unit/week-speaking-delete.test.mjs'));
  assert.ok(paths.includes('tests/unit/issue-deletion-generation.test.mjs'));
  assert.match(manifest['0081_retryable_learning_data_deletion.sql'].overlap_notes, /owner accepted/);
});

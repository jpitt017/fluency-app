import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { prepareRollout } from '../../scripts/prepare-week-speaking-0080-rollout.mjs';

const migration = readFileSync('supabase-b1-b2/migrations/0080_week_speaking_feedback.sql', 'utf8');
const captured = JSON.parse(readFileSync('docs/rollouts/week-speaking-feedback-0080-delete-function-before.json', 'utf8'));

test('the print-only rollout includes the reviewed file and numeric history in one guarded statement', () => {
  assert.equal(createHash('md5').update(captured.definition).digest('hex'), captured.definition_md5);
  const output = prepareRollout(migration, captured);
  assert.match(output, /^do \$fluency_rollout_0080\$/);
  assert.ok(output.includes(migration), 'use the actual reviewed migration without rewriting it');
  assert.match(output, /md5\(current_definition\)/);
  assert.match(output, /to_regclass\('public\.week_speaking_flows'\)/);
  assert.match(output, /version = '0080'/);
  assert.match(output, /values \('0080', 'week_speaking_feedback', array\[migration_sql\]\)/);
  assert.equal(execFileSync(process.execPath, ['scripts/prepare-week-speaking-0080-rollout.mjs'], { encoding: 'utf8' }), output);
});

test('the rollout notes require a deletion gate and warn against migration-first or unsafe rollback', () => {
  const notes = readFileSync('docs/rollouts/week-speaking-feedback-0080-live-before.md', 'utf8');
  assert.match(notes, /old\s+app removes stored files and weekly completion rows \*\*before\*\*/);
  assert.match(notes, /partial deletion followed by an error/);
  assert.match(notes, /block new deletion requests at the edge\/upstream/);
  assert.match(notes, /drain any already running/);
  assert.match(notes, /Deploy the matching new application \*\*before\*\* applying 0080/);
  assert.match(notes, /Do not roll back to the old app/);
});

test('a missing, altered or delimiter-containing input cannot produce rollout SQL', () => {
  assert.throws(() => prepareRollout('', captured));
  assert.throws(() => prepareRollout('$fluency_migration_0080$', captured));
  assert.throws(() => prepareRollout(migration, { ...captured, definition: `${captured.definition}changed` }));
  assert.throws(() => prepareRollout(migration, { ...captured, definition_md5: "0' OR true --" }));
});

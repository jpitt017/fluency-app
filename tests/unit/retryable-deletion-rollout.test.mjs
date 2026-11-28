import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareRollout, REPLACED_FUNCTIONS } from '../../scripts/prepare-retryable-deletion-0081-rollout.mjs';

const migration = readFileSync('supabase-b1-b2/migrations/0081_retryable_learning_data_deletion.sql', 'utf8');
const captured = { functions: Object.fromEntries(REPLACED_FUNCTIONS.map((signature) => {
  const definition = `synthetic reviewed definition for ${signature}`;
  return [signature, { definition, definition_md5: createHash('md5').update(definition).digest('hex') }];
})) };

test('print-only 0081 transport contains the reviewed migration and numeric history in one guarded DO', () => {
  const output = prepareRollout(migration, captured);
  assert.match(output, /^do \$fluency_rollout_0081\$/);
  assert.match(output, /end \$fluency_rollout_0081\$;\n$/);
  assert.ok(output.includes(migration), 'store and execute the exact reviewed file');
  assert.match(output, /version = '0081'/);
  assert.match(output, /to_regclass\('public\.data_deletion_safety_config'\)/);
  assert.match(output, /to_regclass\('public\.recording_key_sequence'\)/);
  assert.match(output, /has_table_privilege\('service_role', 'public\.ai_request_logs', 'select'\)/);
  assert.match(output, /has_table_privilege\('service_role', 'public\.ai_request_logs', 'insert'\)/);
  assert.match(output, /has_table_privilege\('service_role', 'public\.ai_request_logs', 'delete'\)/);
  for (const signature of REPLACED_FUNCTIONS) {
    assert.ok(output.includes(`md5(pg_get_functiondef('${signature}'::regprocedure))`));
    assert.ok(output.includes(captured.functions[signature].definition_md5));
  }
  assert.match(output, /execute migration_sql;/);
  assert.match(output, /values \('0081', 'retryable_learning_data_deletion', array\[migration_sql\]\)/);
});

test('the CLI requires a snapshot and only prints the prepared SQL', () => {
  const absent = spawnSync(process.execPath, ['scripts/prepare-retryable-deletion-0081-rollout.mjs'], { encoding: 'utf8' });
  assert.equal(absent.status, 1);
  assert.equal(absent.stdout, '');
  assert.match(absent.stderr, /snapshot/);
  const dir = mkdtempSync(join(tmpdir(), 'fluency-rollout-0081-'));
  try {
    const file = join(dir, 'synthetic-functions.json');
    writeFileSync(file, JSON.stringify(captured));
    const output = execFileSync(process.execPath, ['scripts/prepare-retryable-deletion-0081-rollout.mjs', file], { encoding: 'utf8' });
    assert.equal(output, prepareRollout(migration, captured));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('missing or changed function captures and unsafe delimiters fail before producing SQL', () => {
  const missing = structuredClone(captured);
  delete missing.functions[REPLACED_FUNCTIONS[1]];
  assert.throws(() => prepareRollout(migration, missing), /captured definition/);
  const altered = structuredClone(captured);
  altered.functions[REPLACED_FUNCTIONS[0]].definition += ' changed';
  assert.throws(() => prepareRollout(migration, altered), /captured definition/);
  const injection = structuredClone(captured);
  injection.functions[REPLACED_FUNCTIONS[2]].definition_md5 = "0' OR true --";
  assert.throws(() => prepareRollout(migration, injection), /captured definition/);
  for (const invalid of ['', '$fluency_migration_0081$', '$fluency_rollout_0081$', '\0']) {
    assert.throws(() => prepareRollout(invalid, captured), /Invalid migration/);
  }
});

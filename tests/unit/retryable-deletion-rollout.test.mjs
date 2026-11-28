import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APPROVED_MIGRATION_SHA256, prepareRollout, REPLACED_FUNCTIONS } from '../../scripts/prepare-retryable-deletion-0081-rollout.mjs';

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
  assert.equal(createHash('sha256').update(migration, 'utf8').digest('hex'), APPROVED_MIGRATION_SHA256);
  const checksumGuard = `if encode(sha256(convert_to(migration_sql, 'UTF8')), 'hex') <> '${APPROVED_MIGRATION_SHA256}' then`;
  assert.ok(output.includes(checksumGuard), 'the embedded migration must be checked at execution time');
  assert.ok(output.indexOf(checksumGuard) < output.indexOf('execute migration_sql;'), 'reject changed payloads before execution');
  assert.match(output, /Migration file checksum differs from approved 0081/);
  assert.match(output, /execute migration_sql;/);
  assert.match(output, /values \('0081', 'retryable_learning_data_deletion', array\[migration_sql\]\)/);
});

test('the checked-in apply file is the exact guarded output for the reviewed live function digests', () => {
  const reviewedDigests = {
    'public.delete_my_learning_data()': '47dd2e749ed92f51083a414e9ae0f019',
    'public.finish_week_speaking_deletion(uuid,uuid)': '30e910c40d4b6d5705908567e171710f',
    'public.get_ai_eval_cache(text)': '6f122ec6013461e2b186a9b9ffe818d4',
    'public.set_ai_eval_cache(text,text,text,jsonb)': '4210a38ecebcec2aff9ddf3a27e72b90',
  };
  let expected = prepareRollout(migration, captured);
  for (const signature of REPLACED_FUNCTIONS) {
    const guard = `md5(pg_get_functiondef('${signature}'::regprocedure)) <>`;
    const synthetic = `${guard} '${captured.functions[signature].definition_md5}'`;
    assert.ok(expected.includes(synthetic));
    expected = expected.replace(synthetic, `${guard} '${reviewedDigests[signature]}'`);
  }
  const file = readFileSync('docs/rollouts/retryable-data-deletion-0081-apply.sql', 'utf8');
  assert.equal(file, expected);
  assert.equal(createHash('sha256').update(file, 'utf8').digest('hex'), '27841dc084ee957a02118beaab0921c8780622eaa5055270d18e1ee1617b9f5d');
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
  assert.throws(() => prepareRollout(`${migration}-- accidental edit\n`, captured), /checksum differs from approved 0081/);
  assert.throws(() => prepareRollout(migration.replace('delete from public.ai_evaluation_cache', 'select * from public.ai_evaluation_cache'), captured), /checksum differs from approved 0081/);
});

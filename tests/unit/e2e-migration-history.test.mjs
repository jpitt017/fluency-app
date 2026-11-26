import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { E2E_PROJECT_REF, E2E_PROJECT_URL, LIVE_PROJECT_REF } from '../../scripts/assert-e2e-supabase-target.mjs';
import {
  checkedMigrationDirectory,
  NEVER_APPLY_SQL,
  planE2ESentinels,
  prepareE2EMigrationHistory,
} from '../../scripts/prepare-e2e-migration-history.mjs';

const SCRIPT = fileURLToPath(new URL('../../scripts/prepare-e2e-migration-history.mjs', import.meta.url));
const REPO_MIGRATIONS = fileURLToPath(new URL('../../supabase-b1-b2/migrations', import.meta.url));
const APPROVED_0062 = {
  version: '0062',
  name: 'week_speaking_recording_access',
  statements_sha256: 'fc7cbd95010e817ff7a854f12092046badf80e5533826ddf9f12870d060259fb',
};

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'fluency-e2e-history-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workdir = join(root, 'work');
  const migrations = join(workdir, 'supabase', 'migrations');
  const bin = join(root, 'bin');
  mkdirSync(migrations, { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(migrations, '0001_schema.sql'), '-- local fixture\n');
  const fake = join(bin, 'supabase');
  writeFileSync(fake, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_SUPABASE_CALLS, JSON.stringify(args) + '\\n');
if (process.env.FAKE_FAIL === '1') {
  console.error('sensitive: ' + process.env.E2E_SUPABASE_DB_URL);
  process.exit(7);
}
if (process.env.FAKE_BAD_JSON === '1') {
  console.log('not json');
} else if (args.at(-1).includes('to_regclass')) {
  console.log(JSON.stringify([{ history_exists: process.env.FAKE_HISTORY_EXISTS !== 'false' }]));
} else {
  console.log(process.env.FAKE_HISTORY_ROWS || '[]');
}
`);
  chmodSync(fake, 0o755);
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    RUNNER_TEMP: root,
    FAKE_SUPABASE_CALLS: join(root, 'calls.jsonl'),
    E2E_SUPABASE_PROJECT_REF: E2E_PROJECT_REF,
    E2E_SUPABASE_URL: E2E_PROJECT_URL,
    E2E_SUPABASE_ANON_KEY: 'test-anon',
    E2E_SUPABASE_SERVICE_ROLE_KEY: 'test-service',
    E2E_SUPABASE_DB_URL: `postgresql://postgres.${E2E_PROJECT_REF}:fake-secret@pooler.supabase.test:5432/postgres`,
    E2E_RUN_ID: '123',
    E2E_RUN_ATTEMPT: '1',
    E2E_USER_EMAIL: 'e2e-123-1@example.invalid',
    E2E_USER_PASSWORD: 'fake-password',
    NEXT_PUBLIC_SUPABASE_URL: E2E_PROJECT_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon',
  };
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  delete env.SUPABASE_LIVE_URL;
  delete env.SUPABASE_LIVE_ANON_KEY;
  delete env.FAKE_FAIL;
  delete env.FAKE_BAD_JSON;
  return { root, workdir, migrations, env };
}

function calls(env) {
  return existsSync(env.FAKE_SUPABASE_CALLS)
    ? readFileSync(env.FAKE_SUPABASE_CALLS, 'utf8').trim().split('\n').map(JSON.parse)
    : [];
}

test('only the exact remote-only 0062 history is allowed, and the stub cannot apply', (t) => {
  const f = fixture(t);
  f.env.FAKE_HISTORY_ROWS = JSON.stringify([
    { version: '0001', name: 'schema', statements_sha256: null },
    APPROVED_0062,
  ]);
  assert.deepEqual(prepareE2EMigrationHistory(f.workdir, f.env), [
    { version: '0062', filename: '0062_ci_remote_ledger_sentinel.sql' },
  ]);
  const stub = readFileSync(join(f.migrations, '0062_ci_remote_ledger_sentinel.sql'), 'utf8');
  assert.equal(stub, NEVER_APPLY_SQL);
  assert.match(stub, /raise exception 'CI ledger sentinel must never be applied'/i);
  assert.doesNotMatch(stub, /\b(?:insert|update|delete|create)\b/i);
  const commands = calls(f.env);
  assert.equal(commands.length, 2);
  for (const args of commands) {
    assert.ok(args.includes('--read-only'));
    assert.ok(args.includes('--db-url'));
    assert.ok(args.includes('query'));
    assert.match(args.at(-1), /^select\b/i);
  }
});

test('a new project without a ledger and a project without remote 0062 need no sentinel', (t) => {
  const f = fixture(t);
  f.env.FAKE_HISTORY_EXISTS = 'false';
  assert.deepEqual(prepareE2EMigrationHistory(f.workdir, f.env), []);
  assert.equal(calls(f.env).length, 1);
  assert.deepEqual(readdirSql(f.migrations), ['0001_schema.sql']);
});

test('an existing ledger without a remote-only version needs no sentinel', (t) => {
  const f = fixture(t);
  f.env.FAKE_HISTORY_ROWS = JSON.stringify([{ version: '0001', name: 'schema' }]);
  assert.deepEqual(prepareE2EMigrationHistory(f.workdir, f.env), []);
  assert.deepEqual(readdirSql(f.migrations), ['0001_schema.sql']);
});

function readdirSql(dir) {
  // All fixture files are known, and this check avoids depending on filesystem order.
  return ['0001_schema.sql', '0062_ci_remote_ledger_sentinel.sql'].filter((name) => existsSync(join(dir, name)));
}

test('unknown or altered remote migrations fail before a sentinel or a push', (t) => {
  const f = fixture(t);
  for (const row of [
    { version: '0063', name: 'unreviewed', statements_sha256: 'x' },
    { ...APPROVED_0062, name: 'different' },
    { ...APPROVED_0062, statements_sha256: 'not-the-recorded-hash' },
    { ...APPROVED_0062, statements_sha256: null },
  ]) {
    assert.throws(() => planE2ESentinels(f.migrations, [row]), /unrecognised|does not match/);
    assert.equal(existsSync(join(f.migrations, '0062_ci_remote_ledger_sentinel.sql')), false);
  }
});

test('a matching real local migration wins; changed SQL, name or duplicate version fails closed', (t) => {
  const f = fixture(t);
  const source = '-- a small, deterministic migration fixture\nselect 1;\n';
  const digest = createHash('sha256').update(source).digest('hex');
  const approvals = { '0062': { name: APPROVED_0062.name, sourceSha256: digest, statementsSha256: APPROVED_0062.statements_sha256 } };
  const real = join(f.migrations, '0062_week_speaking_recording_access.sql');
  writeFileSync(real, source);
  assert.deepEqual(planE2ESentinels(f.migrations, [APPROVED_0062], approvals), []);
  writeFileSync(real, `${source}-- changed\n`);
  assert.throws(() => planE2ESentinels(f.migrations, [APPROVED_0062], approvals), /Local 0062 does not match/);
  rmSync(real);
  writeFileSync(join(f.migrations, '0062_wrong_name.sql'), source);
  assert.throws(() => planE2ESentinels(f.migrations, [APPROVED_0062], approvals), /Local 0062 does not match/);
  writeFileSync(real, source);
  assert.throws(() => planE2ESentinels(f.migrations, [APPROVED_0062], approvals), /Duplicate local migration version/);
});

test('unexpected history shapes and duplicate versions are rejected', (t) => {
  const f = fixture(t);
  assert.throws(() => planE2ESentinels(f.migrations, {}), /Invalid E2E migration history/);
  assert.throws(() => planE2ESentinels(f.migrations, [{ version: 'bad\nvalue' }]), /Invalid version/);
  assert.throws(() => planE2ESentinels(f.migrations, [APPROVED_0062, APPROVED_0062]), /Duplicate E2E history version/);
  assert.throws(() => planE2ESentinels(f.migrations, [{ version: '0001', name: 'different' }]), /different names/);
  assert.throws(() => planE2ESentinels(f.migrations, [{ version: '0001', name: null }]), /different names/);
});

test('the dedicated target guard runs before any history query', (t) => {
  const f = fixture(t);
  f.env.E2E_SUPABASE_DB_URL = `postgresql://postgres.${LIVE_PROJECT_REF}:secret@pooler.supabase.test:5432/postgres`;
  assert.throws(() => prepareE2EMigrationHistory(f.workdir, f.env), /Refusing E2E migration access/);
  assert.deepEqual(calls(f.env), []);
});

test('sentinels are confined to runner temp, even through a symlink into the repository', (t) => {
  const f = fixture(t);
  assert.equal(checkedMigrationDirectory(f.workdir, f.root), f.migrations);
  assert.throws(() => checkedMigrationDirectory(f.workdir, join(f.workdir, 'supabase')), /outside the temporary/);
  const bad = join(f.root, 'symlink-work');
  mkdirSync(join(bad, 'supabase'), { recursive: true });
  symlinkSync(REPO_MIGRATIONS, join(bad, 'supabase', 'migrations'), 'dir');
  assert.throws(() => checkedMigrationDirectory(bad, f.root), /outside the temporary/);
});

test('query failures do not print a database URL or password, and malformed JSON fails closed', (t) => {
  const f = fixture(t);
  f.env.FAKE_FAIL = '1';
  const command = spawnSync(process.execPath, [SCRIPT, f.workdir], { env: f.env, encoding: 'utf8' });
  assert.equal(command.status, 1);
  assert.match(command.stderr, /Read-only E2E migration-history check failed/);
  assert.doesNotMatch(command.stderr, /fake-secret|postgresql:\/\//);
  assert.deepEqual(readdirSql(f.migrations), ['0001_schema.sql']);
  delete f.env.FAKE_FAIL;
  f.env.FAKE_BAD_JSON = '1';
  assert.throws(() => prepareE2EMigrationHistory(f.workdir, f.env), /invalid JSON/);
  assert.deepEqual(readdirSql(f.migrations), ['0001_schema.sql']);
});

test('workflow runs the read-only guard only after target verification and before isolated db push', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const job = workflow.slice(workflow.indexOf('  playwright-e2e:\n'), workflow.indexOf('  # Manual dispatch only'));
  const verify = job.indexOf('node scripts/assert-e2e-supabase-target.mjs');
  const preflight = job.indexOf('node scripts/prepare-e2e-migration-history.mjs');
  const push = job.indexOf('supabase --workdir "$workdir" db push');
  assert.ok(verify >= 0 && verify < preflight && preflight < push);
  assert.match(job, /--include-all --yes/);
  assert.doesNotMatch(job, /migration repair|schema_migrations.*(?:insert|update|delete)/i);
  assert.match(workflow, /node --test [^\n]*e2e-migration-history\.test\.mjs/);
});

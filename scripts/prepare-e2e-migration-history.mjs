import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertE2ESupabaseTarget } from './assert-e2e-supabase-target.mjs';

// The shared E2E project contains 0062 from PR #106, which has not merged yet.
// Only this exact recorded migration is allowed to be ahead of this checkout.
// Remove this exception once no tested checkout predates the real 0062 file.
const AHEAD_MIGRATIONS = Object.freeze({
  '0062': Object.freeze({
    name: 'week_speaking_recording_access',
    statementsSha256: 'fc7cbd95010e817ff7a854f12092046badf80e5533826ddf9f12870d060259fb',
    sourceSha256: 'bb1a360d273518a4b5316abb764d1a0e412c678c882d4a01672cda01de55f81c',
  }),
});

// If history changes between the read and `db push`, the CLI might attempt to
// apply this file. It must fail, not manufacture a migration-history record.
export const NEVER_APPLY_SQL = `-- Temporary CI-only ledger sentinel. Never record this as a migration.
do $$
begin
  raise exception 'CI ledger sentinel must never be applied';
end $$;
`;

const HISTORY_EXISTS_SQL = "select to_regclass('supabase_migrations.schema_migrations') is not null as history_exists";
const HISTORY_SQL = String.raw`select version, name,
  encode(sha256(convert_to(array_to_string(statements, E'\n'), 'UTF8')), 'hex') as statements_sha256
from supabase_migrations.schema_migrations order by version`;

function inside(parent, child) {
  const rel = relative(parent, child);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** Sentinels may be written only to the runner's disposable, non-repository workdir. */
export function checkedMigrationDirectory(workdir, runnerTemp) {
  if (!workdir || !runnerTemp) throw new Error('A temporary workdir and RUNNER_TEMP are required');
  const temp = realpathSync(runnerTemp);
  const work = realpathSync(workdir);
  const migrations = realpathSync(join(work, 'supabase', 'migrations'));
  const repo = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
  if (!inside(temp, work) || !inside(work, migrations) || migrations === repo || inside(repo, migrations)) {
    throw new Error('Refusing to write a CI sentinel outside the temporary non-repository workdir');
  }
  return migrations;
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** Return only explicitly recognised remote-only versions; never change the ledger. */
export function planE2ESentinels(migrationDir, rows, approvals = AHEAD_MIGRATIONS) {
  if (!Array.isArray(rows)) throw new Error('Invalid E2E migration history response');
  const local = new Map();
  for (const filename of readdirSync(migrationDir)) {
    if (!filename.endsWith('.sql')) continue;
    const match = /^(\d+)_(.+)\.sql$/.exec(filename);
    if (!match) throw new Error('Invalid local E2E migration filename');
    if (local.has(match[1])) throw new Error(`Duplicate local migration version ${match[1]}`);
    local.set(match[1], { filename, name: match[2] });
  }

  for (const [version, approved] of Object.entries(approvals)) {
    const approvedFile = local.get(version);
    if (approvedFile && (approvedFile.name !== approved.name || sha256(readFileSync(join(migrationDir, approvedFile.filename))) !== approved.sourceSha256)) {
      throw new Error(`Local ${version} does not match the known, already-tested migration`);
    }
  }

  const seen = new Set();
  const sentinels = [];
  for (const row of rows) {
    if (!row || typeof row.version !== 'string' || !/^\d+$/.test(row.version)) {
      throw new Error('Invalid version in E2E migration history');
    }
    if (seen.has(row.version)) throw new Error(`Duplicate E2E history version ${row.version}`);
    seen.add(row.version);
    const approved = approvals[row.version];
    if (approved && (row.name !== approved.name || row.statements_sha256 !== approved.statementsSha256)) {
      throw new Error(`E2E history ${row.version} does not match the reviewed migration`);
    }
    const localFile = local.get(row.version);
    if (localFile) {
      if (row.name !== localFile.name) throw new Error(`E2E history and local migration have different names for version ${row.version}`);
      continue;
    }
    if (!approved) throw new Error(`E2E history has an unrecognised remote-only version ${row.version}; investigate rather than repairing history`);
    sentinels.push({ version: row.version, filename: `${row.version}_ci_remote_ledger_sentinel.sql` });
  }
  return sentinels;
}

function queryReadOnly(workdir, databaseUrl, sql, env) {
  const result = spawnSync('supabase', [
    '--workdir', workdir, '--agent', 'no', '--output', 'json',
    'db', 'query', '--db-url', databaseUrl, '--read-only', sql,
  ], { env, encoding: 'utf8', timeout: 90_000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    // Do not print the command, DB URL, or potentially credential-bearing stderr.
    const reason = result.error ? 'could not run the CLI' : `CLI exit ${result.status ?? 'unknown'}`;
    throw new Error(`Read-only E2E migration-history check failed (${reason})`);
  }
  let output;
  try {
    output = JSON.parse(result.stdout);
  } catch {
    throw new Error('Read-only E2E migration-history check returned invalid JSON');
  }
  // --agent no returns an array; accepting the CLI's agent envelope as well is
  // safe because the rows are validated before any temporary file is written.
  const rows = Array.isArray(output) ? output : output?.rows;
  if (!Array.isArray(rows)) throw new Error('Read-only E2E migration-history check returned no rows array');
  return rows;
}

export function prepareE2EMigrationHistory(workdir, env = process.env) {
  assertE2ESupabaseTarget(env);
  const migrationDir = checkedMigrationDirectory(workdir, env.RUNNER_TEMP);
  const probe = queryReadOnly(workdir, env.E2E_SUPABASE_DB_URL, HISTORY_EXISTS_SQL, env);
  if (probe.length !== 1 || typeof probe[0]?.history_exists !== 'boolean') {
    throw new Error('Unexpected E2E migration-history existence result');
  }
  const rows = probe[0].history_exists ? queryReadOnly(workdir, env.E2E_SUPABASE_DB_URL, HISTORY_SQL, env) : [];
  const sentinels = planE2ESentinels(migrationDir, rows);
  for (const sentinel of sentinels) {
    writeFileSync(join(migrationDir, sentinel.filename), NEVER_APPLY_SQL, { flag: 'wx' });
    console.log(`Verified already-applied E2E migration ${sentinel.version}; added a temporary fail-closed CLI sentinel.`);
  }
  if (sentinels.length === 0) console.log('No E2E remote-only migration sentinel is needed.');
  return sentinels;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/prepare-e2e-migration-history.mjs <temporary-workdir>');
    prepareE2EMigrationHistory(process.argv[2]);
  } catch (error) {
    const message = String(error?.message ?? 'Unknown error').replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.error(`::error title=Isolated E2E migration history::${message}`);
    process.exitCode = 1;
  }
}

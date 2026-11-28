#!/usr/bin/env node
// Every new/changed migration must identify executable tests for both rolling
// deployment directions. This checks evidence exists and runs the referenced
// unit tests; it does not replace review of their semantic coverage or SQL/CI.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MIGRATIONS = 'supabase-b1-b2/migrations/';

export function validateEvidence(changes, manifest, exists) {
  const tests = new Set();
  for (const { status, path } of changes) {
    if (!path.startsWith(MIGRATIONS) || !path.endsWith('.sql')) continue;
    if (status === 'D') throw new Error(`Do not delete a migration: ${path}`);
    const name = path.slice(MIGRATIONS.length);
    if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(name)) throw new Error(`Migration needs a numeric NNNN_name: ${name}`);
    const entry = manifest[name];
    if (!entry || typeof entry.overlap_notes !== 'string' || !entry.overlap_notes.trim()) {
      throw new Error(`Missing compatibility evidence and overlap notes for ${name}`);
    }
    for (const direction of ['old_app_new_schema', 'new_app_old_schema']) {
      if (!Array.isArray(entry[direction]) || entry[direction].length === 0) throw new Error(`Missing ${direction} tests for ${name}`);
      for (const file of entry[direction]) {
        if (typeof file !== 'string' || !/^tests\/unit\/[a-z0-9-]+\.test\.mjs$/.test(file) || !exists(file)) {
          throw new Error(`Invalid or missing executable compatibility test for ${name}: ${file}`);
        }
        tests.add(file);
      }
    }
  }
  return [...tests].sort();
}

function main(base) {
  if (!base || !/^[a-f0-9]{40}$/.test(base)) throw new Error('Pass the exact 40-character pull-request base commit');
  const diff = execFileSync('git', ['diff', '--name-status', '--no-renames', `${base}...HEAD`, '--', MIGRATIONS], { cwd: ROOT, encoding: 'utf8' });
  const changes = diff.trim() ? diff.trim().split('\n').map((line) => {
    const [status, path] = line.split('\t');
    return { status, path };
  }) : [];
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'tests/migration-compatibility.json'), 'utf8'));
  const tests = validateEvidence(changes, manifest, (file) => existsSync(resolve(ROOT, file)));
  if (!tests.length) {
    console.log('No changed migrations; no compatibility evidence needed.');
    return;
  }
  console.log(`Running ${tests.length} recorded old/new app-schema compatibility test file(s).`);
  execFileSync(process.execPath, ['--test', ...tests], { cwd: ROOT, stdio: 'inherit' });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv[2]); }
  catch (error) { console.error(`Migration compatibility check failed: ${error.message}`); process.exitCode = 1; }
}

#!/usr/bin/env node
/**
 * Print, but do NOT execute, the reviewed live apply statement for 0062.
 *
 * Use `execute_query` against the live project, never `create_migration` or
 * `supabase db push`: those write a timestamp history version. The numeric row
 * must be inserted in the same statement as the migration SQL. Any correction
 * to an existing history row needs separate owner approval.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MIGRATION_VERSION = '0062';
export const MIGRATION_NAME = 'week_speaking_recording_access';
export const MIGRATION_PATH = 'supabase-b1-b2/migrations/0062_week_speaking_recording_access.sql';

export function prepareRollout(migration) {
  if (typeof migration !== 'string' || !migration.trim()) {
    throw new Error('Migration SQL is empty.');
  }
  if (/\b(create|replace)\s+(or\s+replace\s+)?function\b/i.test(migration)) {
    throw new Error('Unexpected function replacement: capture the live pg_get_functiondef first.');
  }
  return [
    '-- Reviewed live apply for migration 0062 (owner approval required).',
    migration.trim(),
    '',
    'insert into supabase_migrations.schema_migrations',
    '  (version, name, statements)',
    'values',
    `  ('${MIGRATION_VERSION}', '${MIGRATION_NAME}', null)`,
    'on conflict (version) do nothing;',
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(prepareRollout(readFileSync(MIGRATION_PATH, 'utf8')));
}

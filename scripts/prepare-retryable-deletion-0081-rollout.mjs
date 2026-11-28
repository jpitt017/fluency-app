#!/usr/bin/env node
/**
 * Print only: wrap the reviewed 0081 migration and its numeric history row in
 * one guarded PostgreSQL statement. Never connects to a database. Capture the
 * current live function definitions read-only first, with separate approval.
 * Production application still requires its own explicit approval.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const inner = '$fluency_migration_0081$';
const outer = '$fluency_rollout_0081$';
export const REPLACED_FUNCTIONS = Object.freeze([
  'public.delete_my_learning_data()',
  'public.finish_week_speaking_deletion(uuid,uuid)',
  'public.get_ai_eval_cache(text)',
  'public.set_ai_eval_cache(text,text,text,jsonb)',
]);

export function prepareRollout(migration, captured) {
  if (typeof migration !== 'string' || !migration.trim() || migration.includes(inner)
      || migration.includes(outer) || migration.includes('\0')) {
    throw new Error('Invalid migration body or SQL delimiter');
  }
  const checks = REPLACED_FUNCTIONS.map((signature) => {
    const entry = captured?.functions?.[signature];
    const definition = entry?.definition;
    const digest = entry?.definition_md5;
    if (typeof definition !== 'string' || !definition.trim() || !/^[0-9a-f]{32}$/.test(digest ?? '')
        || createHash('md5').update(definition).digest('hex') !== digest) {
      throw new Error(`The captured definition does not match its digest: ${signature}`);
    }
    // Signatures are fixed constants and only a validated hex digest enters SQL.
    return `  if md5(pg_get_functiondef('${signature}'::regprocedure)) <> '${digest}' then
    raise exception 'Captured function changed: ${signature}';
  end if;`;
  }).join('\n');

  // One DO remains atomic even when the connector cannot keep an interactive
  // BEGIN/ROLLBACK session. Never execute this as an exploratory live probe.
  return `do ${outer}
declare
  migration_sql text := ${inner}${migration}${inner};
begin
  perform pg_advisory_xact_lock(hashtext('fluency-migration-0081'));
  if exists (select 1 from supabase_migrations.schema_migrations where version = '0081')
    or to_regclass('public.data_deletion_safety_config') is not null
    or to_regclass('public.recording_key_sequence') is not null
    or exists (select 1 from information_schema.columns where table_schema = 'public' and (
      (table_name = 'profiles' and column_name in ('data_deletion_generation', 'data_deletion_completed_at'))
      or (table_name = 'issue_reports' and column_name = 'data_deletion_generation')
      or (table_name = 'ai_evaluation_cache' and column_name = 'cache_owner_id')
      or (table_name = 'week_speaking_deletion_locks' and column_name = 'retry_claim')))
    or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (
        'allocate_recording_key', 'promote_retryable_data_deletion', 'claim_retryable_data_deletion',
        'release_retryable_data_deletion', 'guard_pending_data_deletion_row', 'scope_ai_evaluation_cache',
        'guard_issue_deletion_generation', 'guard_pending_data_deletion_storage',
        'list_retryable_deletion_files', 'finish_retryable_data_deletion', 'list_late_deletion_files')) then
    raise exception 'Migration 0081 or its objects already exist; review live state first';
  end if;
  if not has_table_privilege('service_role', 'public.ai_request_logs', 'select')
    or not has_table_privilege('service_role', 'public.ai_request_logs', 'insert')
    or not has_table_privilege('service_role', 'public.ai_request_logs', 'delete') then
    raise exception 'The 0080 recording-key compatibility grants are missing';
  end if;
${checks}
  execute migration_sql;
  insert into supabase_migrations.schema_migrations(version, name, statements)
    values ('0081', 'retryable_learning_data_deletion', array[migration_sql]);
end ${outer};\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) {
    console.error('Usage: node scripts/prepare-retryable-deletion-0081-rollout.mjs <function-snapshot.json>');
    process.exitCode = 1;
  } else {
    const migration = readFileSync('supabase-b1-b2/migrations/0081_retryable_learning_data_deletion.sql', 'utf8');
    const captured = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    process.stdout.write(prepareRollout(migration, captured));
  }
}

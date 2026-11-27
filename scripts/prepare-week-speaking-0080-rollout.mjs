#!/usr/bin/env node
/**
 * Print only: prepare the reviewed 0080 SQL and numeric history entry as one
 * atomic statement. This never connects to Supabase or executes anything.
 * Production application still requires the owner's explicit approval.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const delimiter = '$fluency_migration_0080$';

export function prepareRollout(migration, captured) {
  if (typeof migration !== 'string' || !migration.trim() || migration.includes(delimiter)) {
    throw new Error('Invalid migration body or SQL delimiter');
  }
  const definition = captured?.definition;
  const digest = captured?.definition_md5;
  if (typeof definition !== 'string' || !/^[0-9a-f]{32}$/.test(digest ?? '') ||
      createHash('md5').update(definition).digest('hex') !== digest) {
    throw new Error('The captured live deletion-function definition does not match its digest');
  }

  // One DO is atomic even if the connector does not preserve an interactive
  // BEGIN/ROLLBACK session. Never execute this as a probe on the live project.
  return `do $fluency_rollout_0080$
declare
  migration_sql text := ${delimiter}${migration}${delimiter};
  current_definition text;
begin
  perform pg_advisory_xact_lock(hashtext('fluency-migration-0080'));
  if exists (select 1 from supabase_migrations.schema_migrations where version = '0080')
    or to_regclass('public.week_speaking_flows') is not null
    or to_regclass('public.week_speaking_takes') is not null
    or to_regclass('public.week_speaking_checks') is not null
    or to_regclass('public.week_speaking_deletion_locks') is not null
    or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (
        'week_speaking_recover_stale', 'reserve_week_speaking_take', 'finish_week_speaking_upload',
        'reserve_week_speaking_check', 'finish_week_speaking_check', 'begin_week_speaking_deletion',
        'end_week_speaking_deletion', 'finish_week_speaking_deletion', 'guard_week_speaking_storage_object'))
    or exists (select 1 from pg_trigger where tgrelid = 'storage.objects'::regclass
      and tgname = 'guard_week_speaking_storage_object' and not tgisinternal) then
    raise exception 'Migration 0080 or its objects already exist; review live state first';
  end if;
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into current_definition;
  if md5(current_definition) <> '${digest}' then
    raise exception 'delete_my_learning_data() differs from the captured live definition';
  end if;
  execute migration_sql;
  insert into supabase_migrations.schema_migrations(version, name, statements)
    values ('0080', 'week_speaking_feedback', array[migration_sql]);
end $fluency_rollout_0080$;\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const migration = readFileSync('supabase-b1-b2/migrations/0080_week_speaking_feedback.sql', 'utf8');
  const captured = JSON.parse(readFileSync('docs/rollouts/week-speaking-feedback-0080-delete-function-before.json', 'utf8'));
  process.stdout.write(prepareRollout(migration, captured));
}

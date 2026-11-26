#!/usr/bin/env node
/**
 * Print, but do NOT execute, the one-time guarded production rollout for 0059.
 * Production has historical timestamp versions as well as newer numeric ones;
 * do not use `db push --include-all` there. See the accompanying rollout notes.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const delimiter = '$fluency_migration_0059$';

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

  // The file is executed verbatim and recorded in the same SQL statement.
  // A single DO is atomic even when the query transport cannot preserve a
  // multi-statement BEGIN/ROLLBACK session. Never run it as a live probe.
  return `do $fluency_rollout_0059$
declare
  migration_sql text := ${delimiter}${migration}${delimiter};
  current_definition text;
begin
  perform pg_advisory_xact_lock(hashtext('fluency-migration-0059'));
  if exists (select 1 from supabase_migrations.schema_migrations where version = '0059')
    or to_regclass('public.week_sentence_practice') is not null
    or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('claim_week_sentence_check', 'finish_week_sentence_check', 'release_week_sentence_check')) then
    raise exception 'Migration 0059 or its objects already exist; review live state first';
  end if;
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into current_definition;
  if md5(current_definition) <> '${digest}' then
    raise exception 'delete_my_learning_data() differs from the captured live definition';
  end if;
  execute migration_sql;
  insert into supabase_migrations.schema_migrations(version, name, statements)
    values ('0059', 'week_sentence_writing_support', array[migration_sql]);
end $fluency_rollout_0059$;\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const migration = readFileSync('supabase-b1-b2/migrations/0059_week_sentence_writing_support.sql', 'utf8');
  const captured = JSON.parse(readFileSync('docs/rollouts/delete-my-learning-data-0059-live-before.json', 'utf8'));
  process.stdout.write(prepareRollout(migration, captured));
}

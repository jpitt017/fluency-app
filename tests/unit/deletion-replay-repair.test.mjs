import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 0011/0013/0024 build delete_my_learning_data() as a list of plain deletes that
 * name four tables no migration creates, and a reset block that writes `xp`
 * where the column is `xp_total`. A database replayed from this repo therefore
 * cannot delete anything, while live can. 0041 repairs the definition as it
 * runs; these tests pin the rules it applies, using the real 0024 body.
 */
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const source = read('supabase-b1-b2/migrations/0024_reconcile_live_schema.sql');
const start = source.indexOf('create or replace function public.delete_my_learning_data()');
const body = source.slice(start, source.indexOf('$$;', source.indexOf('as $$', start)) + 3);

const OPTIONAL = ['vocabulary_review_items', 'cefr_checkpoint_attempts', 'cefr_objective_progress', 'progress_logs'];

/** The SQL 0041 runs, applied to a function definition the way Postgres would. */
function repair(text) {
  const guarded = text.replace(
    /delete from public\.([a-z_]+) where user_id = v_uid;/g,
    (_, table) =>
      `if to_regclass('public.${table}') is not null then execute 'delete from public.${table} where user_id = $1' using v_uid; end if;`,
  );
  return guarded.replaceAll('xp                   = 0', 'xp_total             = 0').replaceAll('xp = 0,', 'xp_total = 0,');
}

test('the repo body really is broken, which is why the repair exists', () => {
  for (const table of OPTIONAL) {
    assert.ok(
      new RegExp(`delete from public\\.${table} where user_id = v_uid;`).test(body),
      `${table} is deleted without a guard in the replayed function`,
    );
  }
  assert.match(body, /\bxp\s+= 0/, 'the reset block writes a column profiles does not have');
  assert.ok(!/create table[^;]*public\.vocabulary_review_items/i.test(read('supabase-b1-b2/migrations/0011_overflow_queue_delete_data.sql')));
});

test('after the repair every optional delete is guarded', () => {
  const fixed = repair(body);
  for (const table of OPTIONAL) {
    assert.ok(
      new RegExp(`if to_regclass\\('public\\.${table}'\\) is not null then execute 'delete from public\\.${table}`).test(fixed),
      `${table} is still unguarded`,
    );
  }
});

test('after the repair the reset block names a real column', () => {
  const fixed = repair(body);
  assert.ok(!/\bxp\s+= 0/.test(fixed), 'xp is still written');
  assert.match(fixed, /xp_total\s+= 0/);
  // profiles only ever had xp_total. (skill_levels does have a bare xp column,
  // which is why this must look at the profiles block and nowhere else.)
  const schema = read('supabase-b1-b2/migrations/0002_learner_state.sql');
  const profiles = schema.slice(schema.indexOf('create table if not exists public.profiles'));
  const profilesBlock = profiles.slice(0, profiles.indexOf(');'));
  assert.match(profilesBlock, /xp_total\s+int/);
  assert.ok(!/^\s+xp\s+int/m.test(profilesBlock), 'profiles has no bare xp column');
});

test('the repair is idempotent: running it twice changes nothing', () => {
  const once = repair(body);
  assert.equal(repair(once), once);
});

test('0041 applies both repairs, and adds only its own branch', () => {
  const migration = read('supabase-b1-b2/migrations/0041_deletion_covers_week_practice.sql');
  assert.match(migration, /if to_regclass\(''public\.\\1''\) is not null then/);
  assert.match(migration, /xp_total             = 0/);
  assert.match(migration, /'week_vocabulary_attempts'/);
  assert.ok(!migration.includes("'week_grammar_attempts'"), '0042 owns the grammar branch');
});

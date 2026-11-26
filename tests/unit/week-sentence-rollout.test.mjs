import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareRollout } from '../../scripts/prepare-week-sentence-0059-rollout.mjs';

const migration = readFileSync(new URL('../../supabase-b1-b2/migrations/0059_week_sentence_writing_support.sql', import.meta.url), 'utf8');
const captured = JSON.parse(readFileSync(new URL('../../docs/rollouts/delete-my-learning-data-0059-live-before.json', import.meta.url), 'utf8'));

test('the offline rollout generator wraps the exact migration once and records numeric 0059 atomically', () => {
  const sql = prepareRollout(migration, captured);
  assert.equal(sql.split(migration).length - 1, 1);
  assert.match(sql, /^do \$fluency_rollout_0059\$/);
  assert.match(sql, /execute migration_sql;/);
  assert.match(sql, /'0059', 'week_sentence_writing_support', array\[migration_sql\]/);
  assert.ok(sql.indexOf('execute migration_sql;') < sql.indexOf('insert into supabase_migrations.schema_migrations'));
  assert.match(sql, new RegExp(`md5\\(current_definition\\) <> '${captured.definition_md5}'`));
  assert.match(sql, /to_regclass\('public\.week_sentence_practice'\) is not null/);
  assert.doesNotMatch(sql, /\b(?:begin;|commit;|rollback;)\b/i);
});

test('the offline rollout generator refuses a changed capture or a delimiter collision', () => {
  assert.throws(() => prepareRollout(migration, { ...captured, definition: `${captured.definition} ` }), /does not match its digest/);
  assert.throws(() => prepareRollout(migration, { ...captured, definition_md5: "bad'--" }), /does not match its digest/);
  assert.throws(() => prepareRollout('$fluency_migration_0059$', captured), /Invalid migration/);
  assert.throws(() => prepareRollout('', captured), /Invalid migration/);
});

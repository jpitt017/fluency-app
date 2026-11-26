import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the 0061 timestamp correction is recorded as history, not as a change to make', () => {
  const history = read('docs/MIGRATION_HISTORY.md');
  assert.match(history, /## 0061 apply record \(2026-11-26\)/);
  assert.match(history, /timestamp version/);
  assert.match(history, /corrected by hand to `0061`/);
  assert.match(history, /0061_log_ai_request_hardening\.sql/);
  assert.match(history, /\| `0061` \| `log_ai_request_hardening` \| present \|/);
  assert.match(history, /No applied migration file was edited/);
  assert.match(history, /existing legacy timestamp rows.*left exactly as they were/);
  assert.match(history, /requires the owner's explicit approval/);
  // The prospective convention is not a licence to rewrite the old rows.
  assert.match(history, /do not edit, rename, replace, or normalize those rows/);
});

test('the pipeline documents how to record a numeric version in the apply statement', () => {
  const pipeline = read('docs/CONTENT_PIPELINE.md');
  const section = pipeline.slice(
    pipeline.indexOf('### 3.1 Applying a migration to live with a numeric history row'),
    pipeline.indexOf('## 4. Author Weeks 1–4 detail and assessments'),
  );
  assert.ok(section.length > 500, 'the apply section exists');
  assert.match(section, /Do \*\*not\*\* use `supabase db push` or the\s+connector's `create_migration` tool against it/);
  assert.match(section, /execute_query/);
  assert.match(section, /insert into supabase_migrations\.schema_migrations/);
  assert.match(section, /\('0062', 'example_name', null\)/);
  assert.match(section, /on conflict \(version\) do nothing/);
  assert.match(section, /unique on `main`/);
  assert.match(section, /pg_get_functiondef/);
  assert.match(section, /begin;` \/ `rollback;`/);
  assert.match(section, /needs the owner's explicit approval/);
});

test('the standing rules pin the approval requirement and the frozen-file rule', () => {
  const agents = read('AGENTS.md');
  assert.match(agents, /requires the owner's explicit approval first/);
  assert.match(agents, /Never edit an applied migration file/);
  assert.match(agents, /docs\/CONTENT_PIPELINE\.md.*§3\.1/);
  assert.match(agents, /docs\/MIGRATION_HISTORY\.md.*0061/);
  assert.match(agents, /leave existing history rows unchanged/);
});

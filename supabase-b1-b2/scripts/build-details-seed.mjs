#!/usr/bin/env node
/** Regenerates migrations/0020_weeks_1_4_and_assessments.sql from the detail JSONs. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const contentRoot = join(root, 'content', 'curriculum');
const details = JSON.parse(readFileSync(join(contentRoot, 'weeks-01-04-details.json'), 'utf8'));
const assessments = JSON.parse(readFileSync(join(contentRoot, 'assessments.json'), 'utf8'));

const lit = (value) => `'${String(value).replaceAll("'", "''")}'`;

const vocabRows = [];
for (const week of details.weeks) {
  let order = 0;
  const add = (groupKind, entry, extra = {}) => {
    order += 1;
    vocabRows.push({
      id: `W${week.number}-${groupKind.toUpperCase().slice(0, 2)}-${order}`,
      week_number: week.number,
      group_kind: groupKind,
      target: entry.target,
      cefr: entry.cefr ?? null,
      use_role: entry.use ?? null,
      example: entry.example,
      card: extra.card ?? 'New',
      sort_order: order,
    });
  };
  week.vocabulary.core.forEach((entry) => add('core', entry));
  week.vocabulary.collocations.forEach((entry) => add('collocation', entry));
  week.vocabulary.families.forEach((family) =>
    add('family', { target: family.base, example: family.forms.join(', '), card: family.card }, { card: 'Shared / recognition' }),
  );
  week.vocabulary.optional.forEach((entry) => add('optional', entry, { card: 'Recognition only' }));
  week.linkers.forEach((entry) =>
    add('linker', { target: entry.target, cefr: entry.cefr, example: `${entry.example} (${entry.function}, ${entry.taughtIn})` }),
  );
}

const checkpointRows = [
  ...assessments.checkpoint1.items.map((item, index) => ({ ...item, reserve: false, sort_order: index + 1 })),
  ...assessments.checkpoint1.reserves.map((item, index) => ({ ...item, reserve: true, sort_order: index + 1 })),
].map((item) => ({
  id: item.id,
  week_number: item.week,
  reserve: item.reserve,
  target: item.target,
  prompt: item.prompt,
  options: item.options,
  key: item.key,
  reason: item.reason,
  sort_order: item.sort_order,
}));

const lines = [];
const push = (line = '') => lines.push(line);

push('-- ============================================================================');
push('-- Weeks 1–4 authoring specs and assessment specs (generated)');
push('-- Edit the JSON under content/curriculum, then run:');
push('--   node supabase-b1-b2/scripts/build-details-seed.mjs');
push('-- ============================================================================');
push();
push(`create table if not exists public.syllabus_week_details (
  week_number int primary key references public.syllabus_weeks(week_number) on delete cascade,
  payload jsonb not null
);`);
push();
push(`create table if not exists public.syllabus_assessments (
  code text primary key,
  title text not null,
  payload jsonb not null
);`);
push();
push(`create table if not exists public.syllabus_vocab_items (
  id text primary key,
  week_number int not null references public.syllabus_weeks(week_number) on delete cascade,
  group_kind text not null check (group_kind in ('core', 'collocation', 'family', 'optional', 'linker')),
  target text not null,
  cefr text,
  use_role text,
  example text not null,
  card text not null,
  sort_order int not null
);`);
push();
push(`create table if not exists public.syllabus_checkpoint_items (
  id text primary key,
  week_number int not null references public.syllabus_weeks(week_number) on delete cascade,
  reserve boolean not null default false,
  target text not null,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  key text not null,
  reason text not null,
  sort_order int not null
);`);
push();

for (const table of ['syllabus_week_details', 'syllabus_assessments', 'syllabus_vocab_items', 'syllabus_checkpoint_items']) {
  push(`alter table public.${table} enable row level security;`);
  push(`drop policy if exists "${table}_public_read" on public.${table};`);
  push(`create policy "${table}_public_read" on public.${table} for select to anon, authenticated using (true);`);
  push(`grant select on public.${table} to anon, authenticated;`);
}
push();

push('insert into public.syllabus_week_details (week_number, payload)');
push(`select (week.value->>'number')::int, week.value
from jsonb_array_elements(${lit(JSON.stringify(details))}::jsonb->'weeks') week(value)
on conflict (week_number) do update set payload = excluded.payload;`);
push();

push('insert into public.syllabus_assessments (code, title, payload) values');
push(`  ('writing-descriptors', 'Writing descriptors', ${lit(JSON.stringify(assessments))}::jsonb->'writingDescriptors'),
  ('placement', 'Placement', ${lit(JSON.stringify(assessments))}::jsonb->'placement'),
  ('checkpoint-1', 'Checkpoint 1', ${lit(JSON.stringify(assessments))}::jsonb->'checkpoint-1')
on conflict (code) do update set title = excluded.title, payload = excluded.payload;`);
push();

push('insert into public.syllabus_vocab_items (id, week_number, group_kind, target, cefr, use_role, example, card, sort_order)');
push(`select v.id, v.week_number, v.group_kind, v.target, v.cefr, v.use_role, v.example, v.card, v.sort_order
from jsonb_to_recordset(${lit(JSON.stringify(vocabRows))}::jsonb) as v(
  id text, week_number int, group_kind text, target text, cefr text, use_role text,
  example text, card text, sort_order int
)
on conflict (id) do update set week_number = excluded.week_number, group_kind = excluded.group_kind,
  target = excluded.target, cefr = excluded.cefr, use_role = excluded.use_role,
  example = excluded.example, card = excluded.card, sort_order = excluded.sort_order;`);
push();

push('insert into public.syllabus_checkpoint_items (id, week_number, reserve, target, prompt, options, key, reason, sort_order)');
push(`select v.id, v.week_number, v.reserve, v.target, v.prompt, v.options, v.key, v.reason, v.sort_order
from jsonb_to_recordset(${lit(JSON.stringify(checkpointRows))}::jsonb) as v(
  id text, week_number int, reserve boolean, target text, prompt text, options jsonb,
  key text, reason text, sort_order int
)
on conflict (id) do update set week_number = excluded.week_number, reserve = excluded.reserve,
  target = excluded.target, prompt = excluded.prompt, options = excluded.options,
  key = excluded.key, reason = excluded.reason, sort_order = excluded.sort_order;`);

const output = join(root, 'migrations', '0020_weeks_1_4_and_assessments.sql');
const sql = `${lines.join('\n')}\n`;
writeFileSync(output, sql);
console.log(`Wrote ${output} (${sql.length} characters, ${vocabRows.length} vocab rows, ${checkpointRows.length} checkpoint rows).`);

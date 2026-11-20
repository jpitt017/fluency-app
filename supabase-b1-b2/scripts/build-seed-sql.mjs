#!/usr/bin/env node
/**
 * Builds migrations/0005_seed_curriculum.sql from content/curriculum/*.json.
 *
 *   node supabase-b1-b2/scripts/build-seed-sql.mjs
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const contentDir = join(root, 'content', 'curriculum');

const readJson = async (file) => JSON.parse(await readFile(join(contentDir, file), 'utf8'));

const quote = (payload) => `$json$ ${JSON.stringify(payload)} $json$::jsonb`;

const course = await readJson('course.json');
const weekFiles = (await readdir(contentDir))
  .filter((f) => /^weeks-\d{2}-\d{2}\.json$/.test(f))
  .sort();

const weekDocs = [];
for (const file of weekFiles) {
  weekDocs.push(await readJson(file));
}

const weekNumbers = weekDocs.flatMap((doc) => doc.modules.map((m) => m.number));
const missing = [];
for (let n = 1; n <= 16; n += 1) {
  if (!weekNumbers.includes(n)) missing.push(n);
}
if (missing.length) {
  throw new Error(`Curriculum is missing week(s): ${missing.join(', ')}`);
}

const duplicateWeeks = weekNumbers.filter((n, i) => weekNumbers.indexOf(n) !== i);
if (duplicateWeeks.length) {
  throw new Error(`Duplicate week numbers: ${duplicateWeeks.join(', ')}`);
}

for (const doc of weekDocs) {
  for (const mod of doc.modules) {
    if (mod.lessons.length !== 7) {
      throw new Error(`Week ${mod.number} has ${mod.lessons.length} sessions, expected 7`);
    }
    if (mod.grammar.length < 1 || mod.grammar.length > 2) {
      throw new Error(`Week ${mod.number} has ${mod.grammar.length} grammar points, expected 1–2`);
    }
    for (const point of mod.grammar) {
      if (!point.items?.length) {
        throw new Error(`Grammar point ${point.key} has no practice items`);
      }
    }
  }
}

const blocks = [
  '-- ============================================================================',
  '-- GENERATED FILE — do not edit by hand.',
  '-- Source: supabase-b1-b2/content/curriculum/*.json',
  '-- Rebuild: node supabase-b1-b2/scripts/build-seed-sql.mjs',
  '--',
  '-- Seeds the English B1 → B2 16-week course: 16 weeks, 112 daily sessions,',
  '-- 560 lesson blocks, practice items, vocabulary decks, listening and reading',
  '-- inputs, speaking and writing tasks, 4 checkpoints, and badges.',
  '-- ============================================================================',
  '',
  '-- 1. Course ---------------------------------------------------------------',
  `select public.import_course(${quote(course.course)}) as course_id;`,
  '',
  '-- 2. Checkpoints and badges ----------------------------------------------',
  `select public.import_assessments(${quote({
    course_slug: course.course.slug,
    checkpoints: course.checkpoints,
    badges: course.badges,
  })}) as assessments;`,
  '',
  '-- 3. Weeks, daily sessions, blocks, practice items, inputs, tasks -------',
];

for (const doc of weekDocs) {
  blocks.push(
    `select public.import_modules(${quote(doc)}) as imported_weeks_${doc.modules.map((m) => m.number).join('_')};`,
    ''
  );
}

blocks.push(
  '-- 4. Vocabulary windows and item counts ----------------------------------',
  `insert into public.lesson_vocab (lesson_id, vocab_item_id, sort_order)
select l.id, it.id, 6 + k
from public.lessons l
join lateral (
  select vi.id, (row_number() over (order by vi.term) - 1) as idx, count(*) over () as total
  from public.vocab_items vi
  join public.vocab_decks vd on vd.id = vi.deck_id and vd.module_id = l.module_id
) it on true
cross join generate_series(1, 2) as k
where it.idx = ((l.module_lesson_number - 1 + 6 + k - 1) % it.total)
on conflict do nothing;

insert into public.practice_items (lesson_id, kind, sort_order, prompt, options, answer, explanation, grammar_point, difficulty)
select
  lv.lesson_id, 'multiple_choice', lv.sort_order + 2,
  format('Which expression matches this meaning? "%s"', vi.definition),
  jsonb_build_array(vi.term) || coalesce((
    select jsonb_agg(d.term order by d.term) from (
      select vi2.term from public.vocab_items vi2
      where vi2.deck_id = vi.deck_id and vi2.term <> vi.term
      order by md5(vi2.term || lv.sort_order::text), vi2.term limit 2) d), '[]'::jsonb),
  vi.term, format('Example: %s', vi.example), l.grammar_point, 1
from public.lesson_vocab lv
join public.vocab_items vi on vi.id = lv.vocab_item_id
join public.lessons l on l.id = lv.lesson_id
where lv.sort_order in (7, 8)
  and not exists (select 1 from public.practice_items p where p.lesson_id = lv.lesson_id and p.sort_order = lv.sort_order + 2);

update public.lesson_blocks b
   set content = jsonb_set(jsonb_set(b.content, '{item_count}', '10'::jsonb), '{mix}', '{"grammar":2,"vocabulary":8}'::jsonb)
 where b.block_kind = 'practice';

-- 5. Summary --------------------------------------------------------------
select jsonb_build_object(
  'weeks', (select count(*) from public.modules),
  'sessions', (select count(*) from public.lessons),
  'lesson_blocks', (select count(*) from public.lesson_blocks),
  'practice_items', (select count(*) from public.practice_items),
  'vocab_items', (select count(*) from public.vocab_items),
  'content_inputs', (select count(*) from public.content_inputs),
  'speaking_tasks', (select count(*) from public.speaking_tasks),
  'writing_tasks', (select count(*) from public.writing_tasks),
  'checkpoints', (select count(*) from public.checkpoints),
  'badges', (select count(*) from public.badges)
) as seed_summary;
`
);

const out = join(root, 'migrations', '0005_seed_curriculum.sql');
await writeFile(out, blocks.join('\n'), 'utf8');

const lessonCount = weekDocs.reduce((n, d) => n + d.modules.reduce((m, x) => m + x.lessons.length, 0), 0);
console.log(`Wrote ${out}`);
console.log(`Weeks: ${weekNumbers.length} | sessions: ${lessonCount} | source files: ${weekFiles.length}`);

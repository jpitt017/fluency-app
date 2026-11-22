#!/usr/bin/env node
/**
 * Regenerates migrations/0019_two_stage_syllabus.sql from
 * content/curriculum/two-stage-syllabus.json. The JSON is the single source of
 * truth; never hand-edit the generated migration.
 *
 *   node supabase-b1-b2/scripts/build-syllabus-seed.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const doc = JSON.parse(readFileSync(join(root, 'content', 'curriculum', 'two-stage-syllabus.json'), 'utf8'));

const tables = [
  'syllabus_stages',
  'syllabus_weeks',
  'syllabus_checkpoints',
  'syllabus_skill_ladders',
  'syllabus_weekly_tasks',
  'syllabus_course',
];

const lines = [];
const push = (line = '') => lines.push(line);

push('-- ============================================================================');
push('-- Two-stage B1 → B2 syllabus (generated — edit the JSON, not this file)');
push(`-- Source: ${doc.source}`);
push('-- Regenerate: node supabase-b1-b2/scripts/build-syllabus-seed.mjs');
push('-- ============================================================================');
push();
push('create extension if not exists pgcrypto;');
push();
push(`create table if not exists public.syllabus_stages (
  stage_number      int primary key check (stage_number between 1 and 2),
  slug              text not null unique,
  title             text not null,
  week_start        int not null,
  week_end          int not null,
  weeks             int not null,
  hours             int not null,
  starting_level    text not null,
  aim               text not null,
  grammar_focus     text not null,
  vocabulary_focus  text not null,
  listening_reading text not null,
  speaking          text not null,
  writing           text not null,
  extra_input       text not null,
  checkpoint_weeks  int[] not null,
  phases            jsonb not null default '[]'::jsonb
);`);
push();
push(`create table if not exists public.syllabus_weeks (
  week_number             int primary key check (week_number between 1 and 32),
  stage_number            int not null references public.syllabus_stages(stage_number) on delete cascade,
  phase                   text not null,
  theme                   text not null,
  main_grammar            text not null,
  secondary_grammar_label text not null,
  secondary_grammar       text,
  skills_focus            text,
  checkpoint_number       int
);`);
push();
push(`create table if not exists public.syllabus_checkpoints (
  checkpoint_number int primary key check (checkpoint_number between 1 and 8),
  stage_number      int not null references public.syllabus_stages(stage_number) on delete cascade,
  after_week        int not null unique references public.syllabus_weeks(week_number),
  code              text not null unique,
  title             text not null,
  assessed          text not null
);`);
push();
push(`create table if not exists public.syllabus_skill_ladders (
  skill_key  text not null,
  week_range text not null,
  label      text not null,
  value      text not null,
  sort_order int not null,
  primary key (skill_key, week_range)
);`);
push();
push(`create table if not exists public.syllabus_weekly_tasks (
  task_key          text primary key,
  title             text not null,
  time_label        text not null,
  requirement_label text not null,
  requirement_kind  text not null check (requirement_kind in ('optional', 'either', 'required', 'recommended')),
  suggested_order   text not null,
  href              text not null,
  sort_order        int not null
);`);
push();
push(`create table if not exists public.syllabus_course (
  key     text primary key,
  version text not null,
  source  text not null,
  payload jsonb not null
);`);
push();

for (const table of tables) {
  push(`alter table public.${table} enable row level security;`);
  push(`drop policy if exists "${table}_public_read" on public.${table};`);
  push(`create policy "${table}_public_read" on public.${table} for select to anon, authenticated using (true);`);
  push(`grant select on public.${table} to anon, authenticated;`);
}
push();

push('-- The entire syllabus document; all other tables are expanded from this payload.');
push(`insert into public.syllabus_course (key, version, source, payload)
values ('two-stage-b1-b2', '${doc.version}', '${doc.source.replaceAll("'", "''")}', '${JSON.stringify(doc).replaceAll("'", "''")}'::jsonb)
on conflict (key) do update set version = excluded.version, source = excluded.source, payload = excluded.payload;`);
push();

push(`insert into public.syllabus_stages (
  stage_number, slug, title, week_start, week_end, weeks, hours, starting_level, aim,
  grammar_focus, vocabulary_focus, listening_reading, speaking, writing, extra_input, checkpoint_weeks, phases
)
select
  (s.value->>'number')::int, s.value->>'slug', s.value->>'title',
  (s.value->>'weekStart')::int, (s.value->>'weekEnd')::int,
  (s.value->>'weeks')::int, (s.value->>'hours')::int,
  s.value->>'startingLevel', s.value->>'aim', s.value->>'grammar', s.value->>'vocabulary',
  s.value->>'listeningReading', s.value->>'speaking', s.value->>'writing', s.value->>'extraInput',
  array(select cp.week_number::int
          from jsonb_array_elements_text(s.value->'checkpoints') with ordinality as cp(week_number, ordinality)),
  s.value->'phases'
from public.syllabus_course doc
cross join lateral jsonb_array_elements(doc.payload->'stages') s(value)
where doc.key = 'two-stage-b1-b2'
on conflict (stage_number) do update set
  slug = excluded.slug, title = excluded.title, week_start = excluded.week_start,
  week_end = excluded.week_end, weeks = excluded.weeks, hours = excluded.hours,
  starting_level = excluded.starting_level, aim = excluded.aim, grammar_focus = excluded.grammar_focus,
  vocabulary_focus = excluded.vocabulary_focus, listening_reading = excluded.listening_reading,
  speaking = excluded.speaking, writing = excluded.writing, extra_input = excluded.extra_input,
  checkpoint_weeks = excluded.checkpoint_weeks, phases = excluded.phases;`);
push();

push(`insert into public.syllabus_weeks (
  week_number, stage_number, phase, theme, main_grammar, secondary_grammar_label,
  secondary_grammar, skills_focus, checkpoint_number
)
select
  (w.value->>'number')::int, (w.value->>'stage')::int, w.value->>'phase', w.value->>'theme',
  w.value->>'mainGrammar', w.value->>'secondaryGrammarLabel', w.value->>'secondaryGrammar',
  w.value->>'skillsFocus',
  (select (cp.value->>'number')::int
     from public.syllabus_course d2
     cross join lateral jsonb_array_elements(d2.payload->'checkpoints') cp(value)
    where d2.key = 'two-stage-b1-b2'
      and (cp.value->>'afterWeek')::int = (w.value->>'number')::int)
from public.syllabus_course doc
cross join lateral jsonb_array_elements(doc.payload->'weeks') w(value)
where doc.key = 'two-stage-b1-b2'
on conflict (week_number) do update set
  stage_number = excluded.stage_number, phase = excluded.phase, theme = excluded.theme,
  main_grammar = excluded.main_grammar, secondary_grammar_label = excluded.secondary_grammar_label,
  secondary_grammar = excluded.secondary_grammar, skills_focus = excluded.skills_focus,
  checkpoint_number = excluded.checkpoint_number;`);
push();

push(`insert into public.syllabus_checkpoints (checkpoint_number, stage_number, after_week, code, title, assessed)
select
  (cp.value->>'number')::int, (cp.value->>'stage')::int, (cp.value->>'afterWeek')::int,
  cp.value->>'code', 'Checkpoint ' || (cp.value->>'number'), cp.value->>'assessed'
from public.syllabus_course doc
cross join lateral jsonb_array_elements(doc.payload->'checkpoints') cp(value)
where doc.key = 'two-stage-b1-b2'
on conflict (checkpoint_number) do update set
  stage_number = excluded.stage_number, after_week = excluded.after_week,
  code = excluded.code, title = excluded.title, assessed = excluded.assessed;`);
push();

push(`insert into public.syllabus_skill_ladders (skill_key, week_range, label, value, sort_order)
select
  ladder.value->>'key', level.value->>'weeks', ladder.value->>'label', level.value->>'value',
  (level.ordinality)::int
from public.syllabus_course doc
cross join lateral jsonb_array_elements(doc.payload->'skillLadders') with ordinality as ladder(value, ordinality)
cross join lateral jsonb_array_elements(ladder.value->'levels') with ordinality as level(value, ordinality)
where doc.key = 'two-stage-b1-b2'
on conflict (skill_key, week_range) do update set
  label = excluded.label, value = excluded.value, sort_order = excluded.sort_order;`);
push();

push(`insert into public.syllabus_weekly_tasks (
  task_key, title, time_label, requirement_label, requirement_kind, suggested_order, href, sort_order
)
select
  task.value->>'key', task.value->>'title', task.value->>'time', task.value->>'requirement',
  task.value->>'requirementKind', task.value->>'order', task.value->>'href', (task.ordinality)::int
from public.syllabus_course doc
cross join lateral jsonb_array_elements(doc.payload->'weeklyTasks') with ordinality as task(value, ordinality)
where doc.key = 'two-stage-b1-b2'
on conflict (task_key) do update set
  title = excluded.title, time_label = excluded.time_label,
  requirement_label = excluded.requirement_label, requirement_kind = excluded.requirement_kind,
  suggested_order = excluded.suggested_order, href = excluded.href, sort_order = excluded.sort_order;`);
push();

push('-- Mirror the stages and weeks into the core curriculum tables used by learner state.');
push(`insert into public.courses (
  slug, title, subtitle, description, level_from, level_to, total_hours, weekly_hours,
  duration_weeks, daily_minutes_min, daily_minutes_max, daily_flow, skill_balance, published
)
select
  s.value->>'slug' || '-weeks-' || (s.value->>'weekStart') || '-' || (s.value->>'weekEnd'),
  s.value->>'title',
  'Weeks ' || (s.value->>'weekRange') || ' · ' || (s.value->>'hours') || ' hours',
  s.value->>'aim', 'B1'::cefr_level, 'B2'::cefr_level,
  (s.value->>'hours')::int, 3.25, (s.value->>'weeks')::int, 15, 30,
  doc.payload->'weeklyTasks', doc.payload->'skillLadders', true
from public.syllabus_course doc
cross join lateral jsonb_array_elements(doc.payload->'stages') s(value)
where doc.key = 'two-stage-b1-b2'
on conflict (slug) do update set
  title = excluded.title, subtitle = excluded.subtitle, description = excluded.description,
  total_hours = excluded.total_hours, weekly_hours = excluded.weekly_hours,
  duration_weeks = excluded.duration_weeks, daily_flow = excluded.daily_flow,
  skill_balance = excluded.skill_balance, published = excluded.published;`);
push();

push(`insert into public.modules (
  course_id, module_number, title, summary, hours, lesson_start, lesson_end,
  grammar_focus, vocabulary_topic, skill_mix
)
select
  c.id,
  (w.value->>'number')::int,
  'Week ' || (w.value->>'number') || ': ' || (w.value->>'theme'),
  'Phase ' || (w.value->>'phase') || ' · ' || (w.value->>'theme'),
  3,
  ((w.value->>'number')::int - 1) * 8 + 1,
  (w.value->>'number')::int * 8,
  array_remove(array[w.value->>'mainGrammar', w.value->>'secondaryGrammar'], null)::text[],
  w.value->>'theme',
  coalesce((
    select jsonb_object_agg(ladder.value->>'key', level.value->>'value')
      from jsonb_array_elements(doc.payload->'skillLadders') ladder(value)
      cross join lateral jsonb_array_elements(ladder.value->'levels') level(value)
     where level.value->>'weeks' = w.value->>'phase'
  ), '{}'::jsonb)
from public.syllabus_course doc
cross join lateral jsonb_array_elements(doc.payload->'weeks') w(value)
join public.courses c
  on c.slug = (select s.value->>'slug' || '-weeks-' || (s.value->>'weekStart') || '-' || (s.value->>'weekEnd')
                 from public.syllabus_course d2
                 cross join lateral jsonb_array_elements(d2.payload->'stages') s(value)
                where d2.key = 'two-stage-b1-b2' and (s.value->>'number')::int = (w.value->>'stage')::int)
where doc.key = 'two-stage-b1-b2'
on conflict (course_id, module_number) do update set
  title = excluded.title, summary = excluded.summary, hours = excluded.hours,
  lesson_start = excluded.lesson_start, lesson_end = excluded.lesson_end,
  grammar_focus = excluded.grammar_focus, vocabulary_topic = excluded.vocabulary_topic,
  skill_mix = excluded.skill_mix;`);
push();

push(`insert into public.checkpoints (
  course_id, module_id, code, title, timing_label, description, tasks, duration_minutes, skills
)
select
  c.id,
  (select m.id from public.modules m
    where m.course_id = c.id and m.module_number = (cp.value->>'afterWeek')::int),
  'two-stage-' || (cp.value->>'code'),
  'Checkpoint ' || (cp.value->>'number'),
  'After week ' || (cp.value->>'afterWeek'),
  cp.value->>'assessed',
  jsonb_build_array(jsonb_build_object('label', 'Assessed', 'detail', cp.value->>'assessed')),
  30,
  array['grammar'::skill_area, 'speaking'::skill_area, 'writing'::skill_area]
from public.syllabus_course doc
cross join lateral jsonb_array_elements(doc.payload->'checkpoints') cp(value)
join public.courses c
  on c.slug = (select s.value->>'slug' || '-weeks-' || (s.value->>'weekStart') || '-' || (s.value->>'weekEnd')
                 from public.syllabus_course d2
                 cross join lateral jsonb_array_elements(d2.payload->'stages') s(value)
                where d2.key = 'two-stage-b1-b2' and (s.value->>'number')::int = (cp.value->>'stage')::int)
where doc.key = 'two-stage-b1-b2'
on conflict (code) do update set
  course_id = excluded.course_id, module_id = excluded.module_id, title = excluded.title,
  timing_label = excluded.timing_label, description = excluded.description,
  tasks = excluded.tasks, duration_minutes = excluded.duration_minutes, skills = excluded.skills;`);

const output = join(root, 'migrations', '0019_two_stage_syllabus.sql');
writeFileSync(output, `${lines.join('\n')}\n`);
console.log(`Wrote ${output} (${lines.join('\n').length} characters).`);

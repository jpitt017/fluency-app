import { mkdir, writeFile } from 'node:fs/promises';
import {
  COURSE_ASSESSMENTS,
  COURSE_ID,
  COURSE_MODULES,
  COURSE_OVERVIEW,
  COURSE_SESSIONS,
} from '../lib/course-architecture.ts';

const sqlEscape = (value) => {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
};

const jsonbLiteral = (value) => `${sqlEscape(JSON.stringify(value))}::jsonb`;

const lines = [];
lines.push('-- Seed full 64-hour (8 modules, 32 sessions, 128 blocks, 32 lesson plans) Global English Fluency B1 -> B2 curriculum.');
lines.push('-- Source: English fluency Course Architecture.pdf');
lines.push('-- Idempotent: safe to re-run.');
lines.push('');

lines.push(`INSERT INTO course.courses (id, title, description, level_from, level_to, total_hours, total_sessions, weeks, hours_per_week)`);
lines.push(`VALUES (${sqlEscape(COURSE_ID)}::uuid, ${sqlEscape(COURSE_OVERVIEW.title)}, ${sqlEscape('A 64-hour, 32-session global English course taking learners from CEFR B1 (Independent) to B2 (Upper-Intermediate). Built around global intelligibility, connected speech, high-frequency global lexis, multi-accent listening, and structured cross-cultural speaking. 16 weeks at 4 hours per week.')}, 'B1', 'B2', 64, 32, 16, 4)`);
lines.push(`ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, level_from = EXCLUDED.level_from, level_to = EXCLUDED.level_to, total_hours = EXCLUDED.total_hours, total_sessions = EXCLUDED.total_sessions, weeks = EXCLUDED.weeks, hours_per_week = EXCLUDED.hours_per_week, updated_at = now();`);
lines.push('');

lines.push(`INSERT INTO course.modules (id, course_id, module_number, title, theme, core_focus, hours, session_start, session_end, sort_order) VALUES`);
lines.push(
  COURSE_MODULES.map(
    (m) =>
      `(${sqlEscape(m.id)}::uuid, ${sqlEscape(COURSE_ID)}::uuid, ${m.module_number}, ${sqlEscape(m.title)}, ${sqlEscape(m.theme)}, ${sqlEscape(m.core_focus)}, ${m.hours}, ${m.session_start}, ${m.session_end}, ${m.module_number})`,
  ).join(',\n'),
);
lines.push(`ON CONFLICT (course_id, module_number) DO UPDATE SET title = EXCLUDED.title, theme = EXCLUDED.theme, core_focus = EXCLUDED.core_focus, hours = EXCLUDED.hours, session_start = EXCLUDED.session_start, session_end = EXCLUDED.session_end, sort_order = EXCLUDED.sort_order;`);
lines.push('');

lines.push(`INSERT INTO course.sessions (id, module_id, module_number, session_number, title, theme, description, duration_minutes, status, pronunciation_focus, grammar_lexis, listening_focus, speaking_pragmatics, objectives, homework) VALUES`);
lines.push(
  COURSE_SESSIONS.map((s) => {
    const mod = COURSE_MODULES.find((m) => m.module_number === s.module_number);
    return `(${sqlEscape(s.id)}::uuid, ${sqlEscape(mod.id)}::uuid, ${s.module_number}, ${s.session_number}, ${sqlEscape(s.title)}, ${sqlEscape(mod.theme)}, ${sqlEscape(s.description)}, ${s.duration_minutes}, 'planned'::course.session_status, ${sqlEscape(s.pronunciation_focus)}, ${sqlEscape(s.grammar_lexis)}, ${sqlEscape(s.listening_focus)}, ${sqlEscape(s.speaking_pragmatics)}, ${sqlEscape(s.objectives)}, ${sqlEscape(s.homework)})`;
  }).join(',\n'),
);
lines.push(`ON CONFLICT (module_id, session_number) DO UPDATE SET module_number = EXCLUDED.module_number, title = EXCLUDED.title, theme = EXCLUDED.theme, description = EXCLUDED.description, duration_minutes = EXCLUDED.duration_minutes, pronunciation_focus = EXCLUDED.pronunciation_focus, grammar_lexis = EXCLUDED.grammar_lexis, listening_focus = EXCLUDED.listening_focus, speaking_pragmatics = EXCLUDED.speaking_pragmatics, objectives = EXCLUDED.objectives, homework = EXCLUDED.homework, updated_at = now();`);
lines.push('');

// Emit session_blocks in 4 module-pair batches for readability
for (let start = 0; start < COURSE_SESSIONS.length; start += 8) {
  const slice = COURSE_SESSIONS.slice(start, start + 8);
  lines.push(`INSERT INTO course.session_blocks (session_id, block_number, title, start_minute, end_minute, description, content, block_type) VALUES`);
  lines.push(
    slice
      .flatMap((s) =>
        s.blocks.map(
          (b) =>
            `(${sqlEscape(s.id)}::uuid, ${b.block_number}, ${sqlEscape(b.title)}, ${b.start_minute}, ${b.end_minute}, ${sqlEscape(b.description)}, ${jsonbLiteral(b.content)}, ${sqlEscape(b.block_type)})`,
        ),
      )
      .join(',\n'),
  );
  lines.push(`ON CONFLICT (session_id, block_number) DO UPDATE SET title = EXCLUDED.title, start_minute = EXCLUDED.start_minute, end_minute = EXCLUDED.end_minute, description = EXCLUDED.description, content = EXCLUDED.content, block_type = EXCLUDED.block_type;`);
  lines.push('');
}

lines.push(`INSERT INTO course.lesson_plans (session_id, content, notes)`);
lines.push(`SELECT`);
lines.push(`  s.id,`);
lines.push(`  jsonb_build_object(`);
lines.push(`    'version', 1,`);
lines.push(`    'summary', coalesce(s.objectives, s.title),`);
lines.push(`    'course_hour_end', s.session_number * 2,`);
lines.push(`    'objectives', jsonb_build_array(coalesce(s.objectives, s.title), 'Prosody Lab (0–25 min): ' || coalesce(s.pronunciation_focus, ''), 'Speaking Task (95–120 min): ' || coalesce(s.speaking_pragmatics, '')),`);
lines.push(`    'blocks', (`);
lines.push(`      SELECT jsonb_agg(jsonb_build_object(`);
lines.push(`        'number', b.block_number, 'title', b.title, 'window', lpad(b.start_minute::text, 2, '0') || '–' || b.end_minute || ' min',`);
lines.push(`        'type', coalesce(b.block_type, case b.block_number when 1 then 'pronunciation' when 2 then 'language' when 3 then 'listening' else 'speaking' end),`);
lines.push(`        'description', b.description,`);
lines.push(`        'focus', case b.block_number when 1 then coalesce(s.pronunciation_focus, '') when 2 then coalesce(s.grammar_lexis, '') when 3 then coalesce(s.listening_focus, '') else coalesce(s.speaking_pragmatics, '') end,`);
lines.push(`        'procedure', case b.block_number when 1 then jsonb_build_array('Warm-up ear calibration against model phrasing.', 'Targeted drill on session prosody focus.', 'Back-chaining and rhythmic shadowing on model extract.', 'Record 30s self-check take and compare stress/pausing.') when 2 then jsonb_build_array('Guided discovery of target structures and collocations.', 'Form, meaning, and pragmatics concept check.', 'Controlled transformation and error-repair drills.', 'Personalized production anchored to global topics.') when 3 then jsonb_build_array('Pre-listening prediction and accent/register cues.', 'First listen for gist and speaker stance.', 'Second listen for detail and pragmatic nuances.', 'Post-listening oral summary without transcript.') else jsonb_build_array('3-minute structured planning using session lexis.', 'Timed speaking task / debate / cross-cultural role-play.', 'Self-assessment on CEFR B2 rubric.', 'Targeted reformulation and audio journal launch.') end,`);
lines.push(`        'materials', case b.block_number when 1 then jsonb_build_array('Model audio extract', 'Stress & chunking guide', 'Voice recorder') when 2 then jsonb_build_array('Collocation & grammar matrix', 'Contrastive examples', 'Writing Lab') when 3 then jsonb_build_array('Global media extract', 'Accent decoding notes', 'Comprehension check') else jsonb_build_array('Debate / case-study prompt', '2-minute timer', 'B2 CEFR rubric') end`);
lines.push(`      ) ORDER BY b.block_number) FROM course.session_blocks b WHERE b.session_id = s.id`);
lines.push(`    ),`);
lines.push(`    'key_language', coalesce((SELECT jsonb_agg(trim(t.x)) FROM unnest(regexp_split_to_array(coalesce(s.grammar_lexis, ''), '[.;]\\s+')) AS t(x) WHERE length(trim(t.x)) > 2), '[]'::jsonb),`);
lines.push(`    'listening', jsonb_build_object('focus', coalesce(s.listening_focus, ''), 'texts', jsonb_build_array('Primary global media extract', 'Multi-accent comparison clip')),`);
lines.push(`    'speaking', jsonb_build_object('focus', coalesce(s.speaking_pragmatics, ''), 'outcome', 'Timed cross-cultural speaking task assessed on the CEFR B2 rubric.'),`);
lines.push(`    'homework', coalesce(s.homework, ''),`);
lines.push(`    'assessment', jsonb_build_object('formative', jsonb_build_array('Prosody shadowing check', 'Interactive block exercises'), 'criteria', ${jsonbLiteral(COURSE_OVERVIEW.b2_rubric_criteria.map((c) => c.name))}, 'course_weights', ${jsonbLiteral(COURSE_ASSESSMENTS.map((a) => ({ name: a.name, weight_percent: a.weight_percent, session_reference: a.session_reference })))})`);
lines.push(`  ),`);
lines.push(`  'Session ' || s.session_number || ' · Module ' || m.module_number || ': ' || m.title`);
lines.push(`FROM course.sessions s JOIN course.modules m ON m.id = s.module_id`);
lines.push(`WHERE m.course_id = ${sqlEscape(COURSE_ID)}::uuid`);
lines.push(`ON CONFLICT (session_id) DO UPDATE SET content = EXCLUDED.content, notes = EXCLUDED.notes, updated_at = now();`);
lines.push('');

await mkdir('Supabase/migrations', { recursive: true });
await writeFile('Supabase/migrations/20261119000005_seed_course_architecture.sql', lines.join('\n'));
console.log(`Generated compact Supabase/migrations/20261119000005_seed_course_architecture.sql (${lines.join('\n').length} bytes).`);

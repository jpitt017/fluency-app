-- ============================================================================
-- Two-stage B1 → B2 syllabus (generated — edit the JSON, not this file)
-- Source: Fluency Studio: B1 to B2 English Course Syllabus (21 Nov 2026)
-- Regenerate: node supabase-b1-b2/scripts/build-syllabus-seed.mjs
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.syllabus_stages (
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
);

create table if not exists public.syllabus_weeks (
  week_number             int primary key check (week_number between 1 and 32),
  stage_number            int not null references public.syllabus_stages(stage_number) on delete cascade,
  phase                   text not null,
  theme                   text not null,
  main_grammar            text not null,
  secondary_grammar_label text not null,
  secondary_grammar       text,
  skills_focus            text,
  checkpoint_number       int
);

create table if not exists public.syllabus_checkpoints (
  checkpoint_number int primary key check (checkpoint_number between 1 and 8),
  stage_number      int not null references public.syllabus_stages(stage_number) on delete cascade,
  after_week        int not null unique references public.syllabus_weeks(week_number),
  code              text not null unique,
  title             text not null,
  assessed          text not null
);

create table if not exists public.syllabus_skill_ladders (
  skill_key  text not null,
  week_range text not null,
  label      text not null,
  value      text not null,
  sort_order int not null,
  primary key (skill_key, week_range)
);

create table if not exists public.syllabus_weekly_tasks (
  task_key          text primary key,
  title             text not null,
  time_label        text not null,
  requirement_label text not null,
  requirement_kind  text not null check (requirement_kind in ('optional', 'either', 'required', 'recommended')),
  suggested_order   text not null,
  href              text not null,
  sort_order        int not null
);

create table if not exists public.syllabus_course (
  key     text primary key,
  version text not null,
  source  text not null,
  payload jsonb not null
);

alter table public.syllabus_stages enable row level security;
drop policy if exists "syllabus_stages_public_read" on public.syllabus_stages;
create policy "syllabus_stages_public_read" on public.syllabus_stages for select to anon, authenticated using (true);
grant select on public.syllabus_stages to anon, authenticated;
alter table public.syllabus_weeks enable row level security;
drop policy if exists "syllabus_weeks_public_read" on public.syllabus_weeks;
create policy "syllabus_weeks_public_read" on public.syllabus_weeks for select to anon, authenticated using (true);
grant select on public.syllabus_weeks to anon, authenticated;
alter table public.syllabus_checkpoints enable row level security;
drop policy if exists "syllabus_checkpoints_public_read" on public.syllabus_checkpoints;
create policy "syllabus_checkpoints_public_read" on public.syllabus_checkpoints for select to anon, authenticated using (true);
grant select on public.syllabus_checkpoints to anon, authenticated;
alter table public.syllabus_skill_ladders enable row level security;
drop policy if exists "syllabus_skill_ladders_public_read" on public.syllabus_skill_ladders;
create policy "syllabus_skill_ladders_public_read" on public.syllabus_skill_ladders for select to anon, authenticated using (true);
grant select on public.syllabus_skill_ladders to anon, authenticated;
alter table public.syllabus_weekly_tasks enable row level security;
drop policy if exists "syllabus_weekly_tasks_public_read" on public.syllabus_weekly_tasks;
create policy "syllabus_weekly_tasks_public_read" on public.syllabus_weekly_tasks for select to anon, authenticated using (true);
grant select on public.syllabus_weekly_tasks to anon, authenticated;
alter table public.syllabus_course enable row level security;
drop policy if exists "syllabus_course_public_read" on public.syllabus_course;
create policy "syllabus_course_public_read" on public.syllabus_course for select to anon, authenticated using (true);
grant select on public.syllabus_course to anon, authenticated;

-- The entire syllabus document; all other tables are expanded from this payload.
insert into public.syllabus_course (key, version, source, payload)
values ('two-stage-b1-b2', '2026-11-21', 'Fluency Studio: B1 to B2 English Course Syllabus (21 Nov 2026)', '{"version":"2026-11-21","source":"Fluency Studio: B1 to B2 English Course Syllabus (21 Nov 2026)","course":{"title":"Fluency Studio: B1 to B2 English Course","summary":"A self-paced British English course in two 16-week stages that takes learners from secure B1 towards B2 in about eight months, with short daily tasks, instant feedback and no fixed class times.","audience":"Adults and older teenagers (16+) who already use English at B1 level and want to reach B2.","disclaimer":"The course is preparation for B2. It builds a strong base but does not guarantee a B2 result.","start":"Start any day. There are no term dates or class times. Sign up, take the placement test and begin straight away.","pace":"About 3-3.5 hours a week. Sixteen weeks per stage is the recommended pace, not a deadline.","totalWeeks":32,"totalHours":104},"placement":{"summary":"A 24-question test, a short recorded speaking sample and a written paragraph place you at Stage 1 or Stage 2.","components":["24-question test","short recorded speaking sample","written paragraph"],"belowB1":"Learners below B1 are pointed to a foundation course first.","outcomes":["Stage 1 (secure B1)","Stage 2 (B1+ or Stage 1 finished)"]},"stages":[{"number":1,"slug":"b2-preparation","title":"Stage 1: B2 preparation","weekRange":"1-16","weekStart":1,"weekEnd":16,"weeks":16,"hours":52,"startingLevel":"Secure B1","aim":"Secure B1 grammar, then the main B2 structures.","grammar":"One main and one light point a week.","vocabulary":"8-10 words and 5-7 collocations a week.","listeningReading":"2-4 min tracks; 150-350 word texts.","speaking":"Recorded tasks up to 3 min; AI conversation up to 10-15 min.","writing":"120-220 words.","extraInput":"About 60 min a week from the input library.","checkpoints":[4,8,12,16],"phases":[{"weeks":"1-4","focus":"Strengthen B1 foundations."},{"weeks":"5-8","focus":"Move towards B2."},{"weeks":"9-12","focus":"Develop B2 communication."},{"weeks":"13-16","focus":"Consolidate B2."}]},{"number":2,"slug":"b2-consolidation","title":"Stage 2: B2 consolidation","weekRange":"17-32","weekStart":17,"weekEnd":32,"weeks":16,"hours":52,"startingLevel":"B1+ (Stage 1 finished, or placed at B1+)","aim":"Use B2 language accurately and at length, including exam-style tasks.","grammar":"One main point a week, extending Stage 1, plus a recycled point.","vocabulary":"8-10 words and 5-7 collocations a week, plus word formation.","listeningReading":"4-5 min tracks; 400-550 word texts.","speaking":"Long turns of 2-3 min with follow-up; 15-min AI conversation and debate.","writing":"220-260 words: essays, reports, reviews, formal emails.","extraInput":"About 60 min a week, authentic B2 material.","checkpoints":[20,24,28,32],"phases":[{"weeks":"17-20","focus":"Extend past and future."},{"weeks":"21-24","focus":"Build complex sentences."},{"weeks":"25-28","focus":"Work on style and register."},{"weeks":"29-32","focus":"Prepare for B2 exam-style tasks."}]}],"weeklyTasks":[{"key":"vocabulary","title":"Vocabulary: new words, collocations and word families","time":"15 min","requirement":"No","requirementKind":"optional","order":"1","href":"/review"},{"key":"grammar","title":"Grammar: the main point and the light point","time":"15 min","requirement":"No","requirementKind":"optional","order":"2","href":"/labs"},{"key":"listening","title":"Listening: one short track","time":"15 min","requirement":"Listening or reading","requirementKind":"either","order":"3","href":"/labs"},{"key":"reading","title":"Reading: one short text","time":"15 min","requirement":"Listening or reading","requirementKind":"either","order":"3","href":"/labs"},{"key":"speaking","title":"Speaking task: a recorded answer, model hidden on the first try","time":"15 min","requirement":"Yes","requirementKind":"required","order":"4","href":"/labs"},{"key":"conversation","title":"Conversation: a spoken exchange with the app''s AI partner","time":"15 min","requirement":"Recommended","requirementKind":"recommended","order":"5","href":"/labs"},{"key":"writing","title":"Writing task","time":"30 min","requirement":"Yes","requirementKind":"required","order":"6","href":"/labs"},{"key":"review","title":"Review: your cards, mistakes and saved words","time":"15 min","requirement":"No","requirementKind":"optional","order":"Any time","href":"/review"},{"key":"extra-input","title":"Extra listening and reading from the input library","time":"About 60 min a week, in any blocks","requirement":"40 min recommended","requirementKind":"recommended","order":"Any time","href":"/labs"}],"progression":{"rule":"The next week opens when you have done the speaking task, the writing task, and either the listening or the reading.","details":"Do the tasks on any days, in any order; the app suggests an order that works well. Other tasks, including the AI conversation, are recommended: the app shows what you have skipped.","target":"Doing at least five tasks and 40 minutes of extra listening or reading each week is a good target.","feedback":"Exercises are marked as you answer. Speaking, conversation and writing get feedback within seconds: one specific correction, your errors with a corrected version, and an invitation to try again."},"skillLadders":[{"key":"listening","label":"Listening","levels":[{"weeks":"1-4","value":"2 min"},{"weeks":"5-8","value":"2-3 min"},{"weeks":"9-12","value":"3 min"},{"weeks":"13-16","value":"3-4 min"},{"weeks":"17-24","value":"4 min"},{"weeks":"25-32","value":"4-5 min"}]},{"key":"reading","label":"Reading","levels":[{"weeks":"1-4","value":"150-250 words"},{"weeks":"5-8","value":"250-350 words"},{"weeks":"9-12","value":"250-350 words"},{"weeks":"13-16","value":"250-350 words"},{"weeks":"17-24","value":"400-450 words"},{"weeks":"25-32","value":"450-550 words"}]},{"key":"extraInput","label":"Extra input","levels":[{"weeks":"1-4","value":"Graded B1, with transcripts"},{"weeks":"5-8","value":"Graded B1+"},{"weeks":"9-12","value":"Lightly adapted B2"},{"weeks":"13-16","value":"Authentic B2, captions off where possible"},{"weeks":"17-24","value":"Authentic B2"},{"weeks":"25-32","value":"Authentic B2, some B2+"}]},{"key":"speakingTask","label":"Speaking task","levels":[{"weeks":"1-4","value":"60-90 s"},{"weeks":"5-8","value":"2 min"},{"weeks":"9-12","value":"3 min"},{"weeks":"13-16","value":"Position statement, up to 3 min"},{"weeks":"17-24","value":"Long turn 2 min + follow-up"},{"weeks":"25-32","value":"Long turn 3 min + follow-up"}]},{"key":"conversation","label":"Conversation (AI)","levels":[{"weeks":"1-4","value":"3-4 turns"},{"weeks":"5-8","value":"5 min"},{"weeks":"9-12","value":"8 min"},{"weeks":"13-16","value":"10-15 min"},{"weeks":"17-24","value":"15 min"},{"weeks":"25-32","value":"15 min, debate"}]},{"key":"writing","label":"Writing","levels":[{"weeks":"1-4","value":"120-150 words"},{"weeks":"5-8","value":"150-180 words"},{"weeks":"9-12","value":"180-200 words"},{"weeks":"13-16","value":"200-220 words"},{"weeks":"17-24","value":"220-240 words"},{"weeks":"25-32","value":"240-260 words"}]}],"weeks":[{"number":1,"stage":1,"phase":"1-4","theme":"Personal experiences and change","mainGrammar":"Narrative tenses; present perfect vs past simple","secondaryGrammarLabel":"Light grammar","secondaryGrammar":"used to / would; present perfect continuous","skillsFocus":null},{"number":2,"stage":1,"phase":"1-4","theme":"Plans, goals and ambitions","mainGrammar":"Future forms","secondaryGrammarLabel":"Light grammar","secondaryGrammar":"Conditionals 0-2 (review)","skillsFocus":null},{"number":3,"stage":1,"phase":"1-4","theme":"Daily life and social interaction","mainGrammar":"Modals of obligation, advice, ability, permission","secondaryGrammarLabel":"Light grammar","secondaryGrammar":"Question forms; basic linkers","skillsFocus":null},{"number":4,"stage":1,"phase":"1-4","theme":"Travel and cultural experiences","mainGrammar":"Passive voice","secondaryGrammarLabel":"Light grammar","secondaryGrammar":"Relative clauses; comparatives and superlatives","skillsFocus":null},{"number":5,"stage":1,"phase":"5-8","theme":"Technology and digital life","mainGrammar":"Modals of deduction","secondaryGrammarLabel":"Light grammar","secondaryGrammar":"Reported statements","skillsFocus":null},{"number":6,"stage":1,"phase":"5-8","theme":"Work and education","mainGrammar":"Gerunds and infinitives","secondaryGrammarLabel":"Light grammar","secondaryGrammar":"Reported requests and commands","skillsFocus":null},{"number":7,"stage":1,"phase":"5-8","theme":"Media, news and influence","mainGrammar":"Reporting verbs (admit, deny, suggest, insist)","secondaryGrammarLabel":"Light grammar","secondaryGrammar":"Reported questions","skillsFocus":null},{"number":8,"stage":1,"phase":"5-8","theme":"Environment and sustainability","mainGrammar":"Third and mixed conditionals","secondaryGrammarLabel":"Light grammar","secondaryGrammar":"wish / if only","skillsFocus":null},{"number":9,"stage":1,"phase":"9-12","theme":"Health and wellbeing","mainGrammar":"Causative verbs","secondaryGrammarLabel":"Light grammar","secondaryGrammar":"Passive reporting","skillsFocus":null},{"number":10,"stage":1,"phase":"9-12","theme":"Cities, transport and society","mainGrammar":"Articles and quantifiers","secondaryGrammarLabel":"Light grammar","secondaryGrammar":"Comparative structures","skillsFocus":null},{"number":11,"stage":1,"phase":"9-12","theme":"Art, culture and creativity","mainGrammar":"Participle clauses","secondaryGrammarLabel":"Light grammar","secondaryGrammar":"Reduced relative clauses","skillsFocus":null},{"number":12,"stage":1,"phase":"9-12","theme":"Ethics, fairness and choices","mainGrammar":"Inversion and emphasis","secondaryGrammarLabel":"Light grammar","secondaryGrammar":"Cleft sentences","skillsFocus":null},{"number":13,"stage":1,"phase":"13-16","theme":"Global issues and cooperation","mainGrammar":"Hedging language","secondaryGrammarLabel":"Light grammar","secondaryGrammar":"Impersonal structures","skillsFocus":null},{"number":14,"stage":1,"phase":"13-16","theme":"Innovation and the future","mainGrammar":"Future perfect and future continuous","secondaryGrammarLabel":"Light grammar","secondaryGrammar":"Speculation language","skillsFocus":null},{"number":15,"stage":1,"phase":"13-16","theme":"Persuasion and argument","mainGrammar":"Linking devices and concession","secondaryGrammarLabel":"Light grammar","secondaryGrammar":"Formal register","skillsFocus":null},{"number":16,"stage":1,"phase":"13-16","theme":"Review","mainGrammar":"Mixed review chosen from your own mistakes","secondaryGrammarLabel":"Light grammar","secondaryGrammar":null,"skillsFocus":null},{"number":17,"stage":2,"phase":"17-20","theme":"Choices and regrets","mainGrammar":"Past modals: should have, could have, might have","secondaryGrammarLabel":"Recycled grammar","secondaryGrammar":"wish / if only","skillsFocus":"Long turn: a decision you would change"},{"number":18,"stage":2,"phase":"17-20","theme":"Science and discovery","mainGrammar":"Passives with modals and perfect forms","secondaryGrammarLabel":"Recycled grammar","secondaryGrammar":"Passive reporting","skillsFocus":"Report writing"},{"number":19,"stage":2,"phase":"17-20","theme":"Money and consumer life","mainGrammar":"Verbs with a change of meaning (remember, stop, try)","secondaryGrammarLabel":"Recycled grammar","secondaryGrammar":"Gerunds and infinitives","skillsFocus":"Listening for opinion"},{"number":20,"stage":2,"phase":"17-20","theme":"Communication and relationships","mainGrammar":"Future in the past (was going to, would)","secondaryGrammarLabel":"Recycled grammar","secondaryGrammar":"Reported speech","skillsFocus":"Formal and informal emails"},{"number":21,"stage":2,"phase":"21-24","theme":"Law, rights and society","mainGrammar":"Alternatives to if (unless, provided, as long as)","secondaryGrammarLabel":"Recycled grammar","secondaryGrammar":"Mixed conditionals","skillsFocus":"Discussion: agreeing and disagreeing"},{"number":22,"stage":2,"phase":"21-24","theme":"Sport and competition","mainGrammar":"Non-defining relative clauses","secondaryGrammarLabel":"Recycled grammar","secondaryGrammar":"Participle clauses","skillsFocus":"Reading for detail"},{"number":23,"stage":2,"phase":"21-24","theme":"Food, health and lifestyle","mainGrammar":"Word formation: prefixes and suffixes","secondaryGrammarLabel":"Recycled grammar","secondaryGrammar":"Causatives","skillsFocus":"Review writing"},{"number":24,"stage":2,"phase":"21-24","theme":"Work and the economy","mainGrammar":"Purpose, result and contrast","secondaryGrammarLabel":"Recycled grammar","secondaryGrammar":"Linking and concession","skillsFocus":"Essay: for and against"},{"number":25,"stage":2,"phase":"25-28","theme":"Language and identity","mainGrammar":"Emphasis with do, what-clauses and fronting","secondaryGrammarLabel":"Recycled grammar","secondaryGrammar":"Cleft sentences","skillsFocus":"Long turn: comparing two options"},{"number":26,"stage":2,"phase":"25-28","theme":"Travel and its impact","mainGrammar":"Ellipsis and substitution","secondaryGrammarLabel":"Recycled grammar","secondaryGrammar":"Comparative structures","skillsFocus":"Listening for gist and detail"},{"number":27,"stage":2,"phase":"25-28","theme":"History and memory","mainGrammar":"Past perfect continuous; narrative style","secondaryGrammarLabel":"Recycled grammar","secondaryGrammar":"used to / would","skillsFocus":"Story or article writing"},{"number":28,"stage":2,"phase":"25-28","theme":"Media and entertainment","mainGrammar":"Phrasal verbs and formal equivalents","secondaryGrammarLabel":"Recycled grammar","secondaryGrammar":"Formal register","skillsFocus":"Rewriting for register"},{"number":29,"stage":2,"phase":"29-32","theme":"Education and learning","mainGrammar":"Preferences: would rather, prefer, it''s time","secondaryGrammarLabel":"Recycled grammar","secondaryGrammar":"Hedging","skillsFocus":"Discussion: giving reasons"},{"number":30,"stage":2,"phase":"29-32","theme":"Cities and the future","mainGrammar":"Probability: bound to, likely to, may well","secondaryGrammarLabel":"Recycled grammar","secondaryGrammar":"Future perfect and continuous","skillsFocus":"Report on trends"},{"number":31,"stage":2,"phase":"29-32","theme":"Debate and persuasion","mainGrammar":"Building an argument","secondaryGrammarLabel":"Recycled grammar","secondaryGrammar":"Impersonal structures","skillsFocus":"Essay and AI debate"},{"number":32,"stage":2,"phase":"29-32","theme":"B2 review and readiness","mainGrammar":"Mixed review chosen from your own mistakes","secondaryGrammarLabel":"Recycled grammar","secondaryGrammar":null,"skillsFocus":"Full exam-style practice"}],"checkpoints":[{"number":1,"stage":1,"afterWeek":4,"code":"stage1-checkpoint-1","assessed":"B1 grammar, a short spoken story, a 150-word piece"},{"number":2,"stage":1,"afterWeek":8,"code":"stage1-checkpoint-2","assessed":"Reported speech and conditionals, 2 minutes of speaking, a 180-word piece"},{"number":3,"stage":1,"afterWeek":12,"code":"stage1-checkpoint-3","assessed":"3 minutes of structured speaking, a 200-word argument, listening and reading"},{"number":4,"stage":1,"afterWeek":16,"code":"stage1-checkpoint-4","assessed":"A 10-15 minute AI discussion, a 200-220-word piece, a review of your mistakes"},{"number":5,"stage":2,"afterWeek":20,"code":"stage2-checkpoint-1","assessed":"Past modals, passives and verb patterns; a 2-minute long turn; a formal email"},{"number":6,"stage":2,"afterWeek":24,"code":"stage2-checkpoint-2","assessed":"Complex sentences; a 15-minute AI discussion; a 240-word essay"},{"number":7,"stage":2,"afterWeek":28,"code":"stage2-checkpoint-3","assessed":"Rewriting a text for a formal reader; a 3-minute long turn; B2 listening and reading"},{"number":8,"stage":2,"afterWeek":32,"code":"stage2-checkpoint-4","assessed":"Exam-style practice in all four skills, a 260-word piece, a review of your mistakes"}],"externalAssessments":[{"code":"starting-test","title":"Starting test","when":"When you sign up","description":"The free EF SET four-skill test (online, about 90 minutes, aligned to the CEFR)."},{"code":"end-of-stage-1-test","title":"End of Stage 1 test","when":"After week 16","description":"The EF SET test again."},{"code":"end-of-stage-2-test","title":"End of Stage 2 test","when":"After week 32","description":"The EF SET test again."}],"marking":"Speaking and writing are marked on how well you complete the task, your vocabulary, your grammar and how clearly you organise your ideas. Feedback is instant; if you study with a teacher, they confirm or adjust it.","certificate":"The EF SET shows your progress. If you need formal proof of your level, for example for work or university, you can book Cambridge Linguaskill, an online four-skill test you can take from home, through a test centre. It is paid separately.","nextSteps":[{"after":"Stage 1","condition":"You have made clear progress but are below B2 in some skills (most learners)","next":"Stage 2"},{"after":"Stage 1","condition":"You are already at B2 in most skills","next":"B2 exam preparation"},{"after":"Stage 1 or 2","condition":"You studied less than planned or progress was limited","next":"Repeat selected weeks with a study plan"},{"after":"Stage 2","condition":"You are at B2 in most skills","next":"B2 exam preparation"},{"after":"Stage 2","condition":"One or two skills are still below B2","next":"Repeat the matching weeks"}],"principles":["You speak and write every week. Each week ends with a speaking task and a writing task, and progress moves on when they are done, together with that week''s listening or reading.","Fewer words, learned properly. 8-10 new words a week, each with its key collocation, brought back at the right moments by spaced repetition.","Lots of listening and reading. About an hour a week of extra material on the week''s theme, at your level, counts as part of the course.","One grammar point at a time. One main point and one lighter point a week, with a grammar clinic for B1 basics such as articles and prepositions.","Instant feedback. Every task is marked as soon as you submit it, with your mistakes corrected and a chance to try again straight away.","Your mistakes shape your review. Errors you make become review cards, so you practise what you personally get wrong.","Honest about speaking. The app does not score your pronunciation automatically. You shadow model recordings and check yourself; a teacher can assess pronunciation if you study with one."],"adaptation":{"mistakes":"Errors from your speaking, writing and exercises are saved and turned into review cards. Mistakes you repeat come back more often.","ownWords":"While doing extra listening or reading, you can save up to five new words a week with the sentence you found them in. The app adds a definition and British audio.","spacedRepetition":"Course words, your own words and your mistakes come back just before you are likely to forget them, in about 15 minutes of review a week.","grammarClinic":"Short refreshers on B1 basics (present tenses, articles, quantifiers, prepositions, subject-verb agreement) whenever your mistakes show you need them.","personalReviewWeeks":"Weeks 16 and 32 review the grammar you personally find hardest."},"aiAndData":["You always know when it is AI. AI feedback, AI marks and the conversation partner are clearly labelled. If you study with a teacher, they can confirm or change the AI''s feedback.","You can disagree. Tap \"I think this is right\" on any feedback and it is sent for review where a teacher is available.","Your accent is not a mistake. Feedback is about grammar, vocabulary and clarity; a regional or Spanish accent is never marked as an error.","Your own work. Write inside the app. Checkpoint writing is timed, and answers written by another AI tool will not help you learn and may be reviewed.","A safe conversation partner. It stays on the week''s topics, declines inappropriate subjects, and has a report button if anything goes wrong.","Accessible by design. All audio has transcripts or captions. If you cannot record speech, for example because of a speech or hearing impairment, contact support for another way to complete the speaking tasks.","Taking a break. You can pause at any time. When you come back, overdue review is spread over your first few days, not given all at once.","Your data. Recordings, writing and progress are stored under a published privacy policy, with set retention periods, and you can delete your data at any time."],"teachers":["No homework to set or mark by hand. Give each student a stage; the weekly tasks are already built and marked by the app.","See what each student needs. A dashboard shows each student''s progress, most frequent errors with their own sentences, saved words, checkpoint results and test results.","Review only what needs you. The review queue shows only the speaking and writing that needs a teacher''s judgement: pieces where the AI is unsure, repeated errors, feedback the student disputes, checkpoint pieces, and a small random sample so you can check the AI''s marking. Everything else is accepted with its instant feedback.","Confirm the next step. After each stage, the recommended next step is pre-filled for you to confirm.","Live lessons are optional. Use the dashboard to plan your own lessons around students'' errors and themes; the app does not depend on them."]}'::jsonb)
on conflict (key) do update set version = excluded.version, source = excluded.source, payload = excluded.payload;

insert into public.syllabus_stages (
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
  checkpoint_weeks = excluded.checkpoint_weeks, phases = excluded.phases;

insert into public.syllabus_weeks (
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
  checkpoint_number = excluded.checkpoint_number;

insert into public.syllabus_checkpoints (checkpoint_number, stage_number, after_week, code, title, assessed)
select
  (cp.value->>'number')::int, (cp.value->>'stage')::int, (cp.value->>'afterWeek')::int,
  cp.value->>'code', 'Checkpoint ' || (cp.value->>'number'), cp.value->>'assessed'
from public.syllabus_course doc
cross join lateral jsonb_array_elements(doc.payload->'checkpoints') cp(value)
where doc.key = 'two-stage-b1-b2'
on conflict (checkpoint_number) do update set
  stage_number = excluded.stage_number, after_week = excluded.after_week,
  code = excluded.code, title = excluded.title, assessed = excluded.assessed;

insert into public.syllabus_skill_ladders (skill_key, week_range, label, value, sort_order)
select
  ladder.value->>'key', level.value->>'weeks', ladder.value->>'label', level.value->>'value',
  -- Both joins expose a column called ordinality, so this must be qualified:
  -- unqualified, PostgreSQL rejects the whole insert as ambiguous and no fresh
  -- database can be built. The ladder's ordinal is the one that reproduces live
  -- (sort_order 1,2,3 across the six skills of a phase); the level's would write
  -- 1 for every level.
  (ladder.ordinality)::int
from public.syllabus_course doc
cross join lateral jsonb_array_elements(doc.payload->'skillLadders') with ordinality as ladder(value, ordinality)
cross join lateral jsonb_array_elements(ladder.value->'levels') with ordinality as level(value, ordinality)
where doc.key = 'two-stage-b1-b2'
on conflict (skill_key, week_range) do update set
  label = excluded.label, value = excluded.value, sort_order = excluded.sort_order;

insert into public.syllabus_weekly_tasks (
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
  suggested_order = excluded.suggested_order, href = excluded.href, sort_order = excluded.sort_order;

-- Mirror the stages and weeks into the core curriculum tables used by learner state.
insert into public.courses (
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
  skill_balance = excluded.skill_balance, published = excluded.published;

insert into public.modules (
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
  skill_mix = excluded.skill_mix;

insert into public.checkpoints (
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
  tasks = excluded.tasks, duration_minutes = excluded.duration_minutes, skills = excluded.skills;

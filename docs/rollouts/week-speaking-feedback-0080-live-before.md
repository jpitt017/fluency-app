# Weekly speaking 0080: live before-state

Read-only inspection on 2026-11-25, before any 0080 apply. Project
`ebzmkhrssgnzmixfsuso` is the active English Fluency B1-B2 production project.
No production data, release flags, schema or migration history were changed.
The live `speaking-recordings` bucket is private, with Storage versioning
currently disabled (as is the isolated E2E bucket). Live migration history ends
numerically at 0062; 0080 was absent on main, live and all open migration PRs
when selected. Recheck all three before rollout.

Additional read-only checks: `authenticated` can currently execute
`public.delete_my_learning_data()`; `anon` cannot and `service_role` can.
The existing `week speaking recordings staff read` Storage policy requires five
folder segments even though `storage.foldername` excludes the filename and the
weekly keys have four. The only non-internal triggers currently on
`storage.objects` are `protect_objects_delete` and `update_objects_updated_at`;
`postgres` has `TRIGGER` privilege there. 0080 corrects the staff read policy and
adds a narrowly scoped metadata trigger for new immutable weekly keys. It also
routes learner deletion through a service-only, token-checked wrapper. The old
app removes stored files and weekly completion rows **before** it calls the
revoked deletion RPC. Applying 0080 while that app can still serve deletion
requests can therefore cause a partial deletion followed by an error; it is
**not** fail-closed. The coordinated, gated app-first sequence below is required.

The following is the production result of
`select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure)`;
0080 inserts a guarded branch into this definition rather than replacing the
body with an older repository copy. A fresh read-only capture on 2026-11-27
matched the [exact captured definition](week-speaking-feedback-0080-delete-function-before.json)
(6,318 characters, MD5 `20352d510903b69a1543ea3a66e687d4`). The readable SQL
below only normalises whitespace on blank lines. Compare the exact definition
again immediately before any owner-approved apply.

```sql
CREATE OR REPLACE FUNCTION public.delete_my_learning_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_audio_paths text[];
  v_table text;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select coalesce(array_agg(audio_path) filter (where audio_path is not null and audio_path <> ''), '{}')
    into v_audio_paths from public.speaking_attempts where user_id = v_uid;

  if to_regclass('public.mediation_attempts') is not null then execute 'delete from public.mediation_attempts where user_id = $1' using v_uid; end if;
  if to_regclass('public.issue_reports') is not null then execute 'delete from public.issue_reports where user_id = $1' using v_uid; end if;
  if to_regclass('public.issue_report_attempts') is not null then execute 'delete from public.issue_report_attempts where user_id = $1' using v_uid; end if;
  if to_regclass('public.week_input_submissions') is not null then execute 'delete from public.week_input_submissions where user_id = $1' using v_uid; end if;
  if to_regclass('public.week_input_answers') is not null then execute 'delete from public.week_input_answers where user_id = $1' using v_uid; end if;
  if to_regclass('public.week_output_submissions') is not null then execute 'delete from public.week_output_submissions where user_id = $1' using v_uid; end if;
  if to_regclass('public.week_grammar_attempts') is not null then execute 'delete from public.week_grammar_attempts where user_id = $1' using v_uid; end if;
  if to_regclass('public.week_vocabulary_attempts') is not null then
    execute 'delete from public.week_vocabulary_attempts where user_id = $1' using v_uid;
  end if;
  if to_regclass('public.error_review_cards') is not null then execute 'delete from public.error_review_cards where user_id = $1' using v_uid; end if;
  if to_regclass('public.learner_errors') is not null then execute 'delete from public.learner_errors where user_id = $1' using v_uid; end if;
  if to_regclass('public.vocab_reviews') is not null then execute 'delete from public.vocab_reviews where user_id = $1' using v_uid; end if;
  if to_regclass('public.vocab_cards') is not null then execute 'delete from public.vocab_cards where user_id = $1' using v_uid; end if;
  if to_regclass('public.practice_attempts') is not null then execute 'delete from public.practice_attempts where user_id = $1' using v_uid; end if;
  if to_regclass('public.checkpoint_attempts') is not null then execute 'delete from public.checkpoint_attempts where user_id = $1' using v_uid; end if;
  if to_regclass('public.speaking_attempts') is not null then execute 'delete from public.speaking_attempts where user_id = $1' using v_uid; end if;
  if to_regclass('public.writing_submissions') is not null then execute 'delete from public.writing_submissions where user_id = $1' using v_uid; end if;
  if to_regclass('public.lesson_progress') is not null then execute 'delete from public.lesson_progress where user_id = $1' using v_uid; end if;
  if to_regclass('public.daily_sessions') is not null then execute 'delete from public.daily_sessions where user_id = $1' using v_uid; end if;
  if to_regclass('public.skill_levels') is not null then execute 'delete from public.skill_levels where user_id = $1' using v_uid; end if;
  if to_regclass('public.weekly_reports') is not null then execute 'delete from public.weekly_reports where user_id = $1' using v_uid; end if;
  if to_regclass('public.xp_events') is not null then execute 'delete from public.xp_events where user_id = $1' using v_uid; end if;
  if to_regclass('public.user_badges') is not null then execute 'delete from public.user_badges where user_id = $1' using v_uid; end if;
  if to_regclass('public.curriculum_preferences') is not null then execute 'delete from public.curriculum_preferences where user_id = $1' using v_uid; end if;
  if to_regclass('public.enrollments') is not null then execute 'delete from public.enrollments where user_id = $1' using v_uid; end if;
  if to_regclass('public.ai_request_logs') is not null then execute 'delete from public.ai_request_logs where user_id = $1' using v_uid; end if;
  if to_regclass('public.ai_usage_events') is not null then execute 'delete from public.ai_usage_events where user_id = $1' using v_uid; end if;
  if to_regclass('public.ai_usage_resets') is not null then execute 'delete from public.ai_usage_resets where user_id = $1' using v_uid; end if;

  foreach v_table in array array['vocabulary_review_items', 'cefr_checkpoint_attempts', 'cefr_objective_progress', 'progress_logs'] loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('delete from public.%I where user_id = $1', v_table) using v_uid;
    end if;
  end loop;

  update public.profiles
     set learner_band         = 'B1_low',
         target_band          = 'B2_solid',
         xp_total             = 0,
         streak_days          = 0,
         longest_streak       = 0,
         last_active_on       = null,
         daily_word_goal      = 10,
         timezone             = 'Europe/Madrid',
         onboarding_completed = false,
         placement_result     = null,
         current_week         = 1,
         updated_at           = now()
   where id = v_uid;
  if to_regclass('public.week_skill_completions') is not null then execute 'delete from public.week_skill_completions where user_id = $1' using v_uid; end if;

  if to_regclass('public.week_speaking_attempts') is not null then
    select coalesce(v_audio_paths, '{}'::text[]) || coalesce(
      array_agg(recording_path) filter (where recording_path is not null and recording_path <> ''),
      '{}'::text[]
    ) into v_audio_paths
    from public.week_speaking_attempts,
      lateral unnest(array[first_recording_path, second_recording_path]) as paths(recording_path)
    where user_id = v_uid;
    execute 'delete from public.week_speaking_attempts where user_id = $1' using v_uid;
  end if;

  if to_regclass('public.week_sentence_practice') is not null then execute 'delete from public.week_sentence_practice where user_id = $1' using v_uid; end if;
  return jsonb_build_object('deleted', true, 'audio_paths', to_jsonb(v_audio_paths));
end;
$function$
```

**Rollout boundary:** do not apply 0080, insert its numeric migration-history
row, merge, deploy, or release to learners until the owner explicitly approves.
PR CI may apply it only to the separately approved isolated E2E project.

The production rollout needs an enforceable maintenance gate for
`/api/account/delete-data`, not just a promise to deploy quickly:

1. After separate approval, block new deletion requests at the edge/upstream,
   drain any already running, and verify that old deployments cannot still
   serve that route. If the gate or drain cannot be established, stop.
2. Deploy the matching new application **before** applying 0080. While the
   migration is absent, weekly speaking is temporarily unavailable and the new
   deletion route returns 503 before touching files or rows. Keep the gate on.
3. Recapture the live deletion function and recheck main, migration history and
   open migration PRs. Follow `docs/CONTENT_PIPELINE.md` §3.1 to apply 0080
   and record its numeric history row atomically. The print-only
   `node scripts/prepare-week-speaking-0080-rollout.mjs` produces that statement;
   it refuses an existing version/objects or a changed function digest. It never
   connects to Supabase. Do not alter old history rows or audio-release flags.
4. Verify the new deployment and schema, then remove the gate only when the
   compatible deletion route is serving. Do not roll back to the old app with
   0080 still applied and the gate open: that recreates the partial-delete risk.
   Any synthetic live deletion or learner-data deletion needs separate approval.

Plan the temporary speaking/deletion interruption and rollback with the owner;
local replay and mocked browser tests do not prove live Storage cleanup.

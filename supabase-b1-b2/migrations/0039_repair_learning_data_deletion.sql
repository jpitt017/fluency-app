-- Reset learning data without deleting the account, pilot entitlement or billing.
-- The application must delete storage objects before invoking this RPC.
create or replace function public.delete_my_learning_data()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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

  delete from public.mediation_attempts where user_id = v_uid;
  delete from public.issue_reports where user_id = v_uid;
  delete from public.issue_report_attempts where user_id = v_uid;
  delete from public.week_input_submissions where user_id = v_uid;
  delete from public.week_output_submissions where user_id = v_uid;
  if to_regclass('public.week_vocabulary_attempts') is not null then
    execute 'delete from public.week_vocabulary_attempts where user_id = $1' using v_uid;
  end if;
  delete from public.error_review_cards where user_id = v_uid;
  delete from public.learner_errors where user_id = v_uid;
  delete from public.vocab_reviews where user_id = v_uid;
  delete from public.vocab_cards where user_id = v_uid;
  delete from public.practice_attempts where user_id = v_uid;
  delete from public.checkpoint_attempts where user_id = v_uid;
  delete from public.speaking_attempts where user_id = v_uid;
  delete from public.writing_submissions where user_id = v_uid;
  delete from public.lesson_progress where user_id = v_uid;
  delete from public.daily_sessions where user_id = v_uid;
  delete from public.skill_levels where user_id = v_uid;
  delete from public.weekly_reports where user_id = v_uid;
  delete from public.xp_events where user_id = v_uid;
  delete from public.user_badges where user_id = v_uid;
  delete from public.curriculum_preferences where user_id = v_uid;
  delete from public.enrollments where user_id = v_uid;
  delete from public.ai_request_logs where user_id = v_uid;
  delete from public.ai_usage_events where user_id = v_uid;
  delete from public.ai_usage_resets where user_id = v_uid;

  -- These legacy learner tables may exist in installations built from older
  -- histories. Check their existence before referencing them dynamically.
  foreach v_table in array array['vocabulary_review_items', 'cefr_checkpoint_attempts', 'cefr_objective_progress', 'progress_logs'] loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('delete from public.%I where user_id = $1', v_table) using v_uid;
    end if;
  end loop;

  update public.profiles set
    learner_band = 'B1_low', target_band = 'B2_solid', xp_total = 0,
    streak_days = 0, longest_streak = 0, last_active_on = null,
    daily_word_goal = 10, timezone = 'Europe/Madrid',
    onboarding_completed = false, placement_result = null,
    current_week = 1, updated_at = now()
  where id = v_uid;
  return jsonb_build_object('deleted', true, 'audio_paths', to_jsonb(v_audio_paths));
end;
$$;
revoke all on function public.delete_my_learning_data() from public, anon;
grant execute on function public.delete_my_learning_data() to authenticated;

-- Entitlement and billing are deliberately retained on a learning-data reset.
create or replace function public.verify_delete_my_learning_data_coverage()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_fn_def text;
  v_missing text[] := '{}';
  v_tbl text;
begin
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into v_fn_def;
  for v_tbl in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'user_id' and t.table_type = 'BASE TABLE'
      and c.table_name not in ('subscriptions', 'pilot_learners')
    order by c.table_name
  loop
    if position('public.' || v_tbl in v_fn_def) = 0
       and not (v_tbl = any(array['vocabulary_review_items', 'cefr_checkpoint_attempts', 'cefr_objective_progress', 'progress_logs'])
                and position(quote_literal(v_tbl) in v_fn_def) > 0) then
      v_missing := array_append(v_missing, v_tbl);
    end if;
  end loop;
  return jsonb_build_object('covered', cardinality(v_missing) = 0, 'missing_tables', to_jsonb(v_missing));
end;
$$;
revoke all on function public.verify_delete_my_learning_data_coverage() from public, anon, authenticated;
grant execute on function public.verify_delete_my_learning_data_coverage() to service_role;

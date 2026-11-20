-- ============================================================================
-- Migration 0011: Hint-reveal anti-cheat guard for error mastery +
-- complete user learning data & audio deletion RPC (`delete_my_learning_data`)
-- + cache retention helper.
-- ============================================================================

-- 1. Anti-cheat reveal tracking on error_review_cards -----------------------
alter table public.error_review_cards
  add column if not exists hint_revealed_at timestamptz;

create or replace function public.reveal_error_card_hint(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.error_review_cards
     set hint_revealed_at = now(),
         updated_at       = now()
   where id = p_card_id and user_id = v_uid;
end;
$$;

revoke all on function public.reveal_error_card_hint(uuid) from public, anon;
grant execute on function public.reveal_error_card_hint(uuid) to authenticated;

create or replace function public.mark_error_card_mastered(
  p_card_id      uuid,
  p_attempt_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_cat           error_category;
  v_revealed_at   timestamptz;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select category, hint_revealed_at
    into v_cat, v_revealed_at
    from public.error_review_cards
   where id = p_card_id and user_id = v_uid;

  if v_cat is null then
    raise exception 'Error review card not found' using errcode = 'no_data_found';
  end if;

  -- Block same-session copy-paste mastery after clicking reveal
  if v_revealed_at is not null and v_revealed_at > now() - interval '6 hours' then
    return jsonb_build_object(
      'card_id', p_card_id,
      'mastered', false,
      'xp', 0,
      'reason', 'revealed_recently'
    );
  end if;

  update public.error_review_cards
     set mastered          = true,
         mastered_at       = now(),
         suspended         = true,
         last_attempt_text = p_attempt_text,
         last_review_at    = now(),
         reps              = reps + 1,
         updated_at        = now()
   where id = p_card_id and user_id = v_uid;

  perform public.award_xp(v_uid, 'practice', 5, 'error_review_mastered', p_card_id,
    format('Mastered %s repair unprompted', v_cat));
  perform public.record_activity(v_uid);

  return jsonb_build_object('card_id', p_card_id, 'mastered', true, 'xp', 5);
end;
$$;

revoke all on function public.mark_error_card_mastered(uuid, text) from public, anon;
grant execute on function public.mark_error_card_mastered(uuid, text) to authenticated;

-- 2. Complete user data deletion RPC (GDPR / right-to-erasure) --------------
create or replace function public.delete_my_learning_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_audio_paths text[];
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- Capture storage paths before deleting speaking_attempts
  select coalesce(array_agg(audio_path) filter (where audio_path is not null and audio_path <> ''), '{}')
    into v_audio_paths
    from public.speaking_attempts
   where user_id = v_uid;

  -- Delete dependent learner rows in safe order
  delete from public.error_review_cards where user_id = v_uid;
  delete from public.learner_errors where user_id = v_uid;
  delete from public.vocab_reviews where user_id = v_uid;
  delete from public.vocab_cards where user_id = v_uid;
  delete from public.vocabulary_review_items where user_id = v_uid;
  delete from public.practice_attempts where user_id = v_uid;
  delete from public.checkpoint_attempts where user_id = v_uid;
  delete from public.cefr_checkpoint_attempts where user_id = v_uid;
  delete from public.cefr_objective_progress where user_id = v_uid;
  delete from public.speaking_attempts where user_id = v_uid;
  delete from public.writing_submissions where user_id = v_uid;
  delete from public.lesson_progress where user_id = v_uid;
  delete from public.daily_sessions where user_id = v_uid;
  delete from public.progress_logs where user_id = v_uid;
  delete from public.skill_levels where user_id = v_uid;
  delete from public.weekly_reports where user_id = v_uid;
  delete from public.xp_events where user_id = v_uid;
  delete from public.user_badges where user_id = v_uid;
  delete from public.curriculum_preferences where user_id = v_uid;
  delete from public.enrollments where user_id = v_uid;
  delete from public.ai_request_logs where user_id = v_uid;
  delete from public.ai_usage_events where user_id = v_uid;

  -- Also clean expired cache entries while we are here
  delete from public.ai_evaluation_cache where expires_at < now();

  -- Reset profile telemetry fields (keep Stripe subscription record intact unless account deleted)
  update public.profiles
     set placement_result     = null,
         onboarding_completed = false,
         streak_days          = 0,
         xp                   = 0,
         updated_at           = now()
   where id = v_uid;

  return jsonb_build_object(
    'deleted', true,
    'audio_paths', to_jsonb(v_audio_paths)
  );
end;
$$;

revoke all on function public.delete_my_learning_data() from public, anon;
grant execute on function public.delete_my_learning_data() to authenticated;

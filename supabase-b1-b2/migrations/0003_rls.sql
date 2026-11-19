-- ============================================================================
-- Functions, triggers, RLS policies and storage rules.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- XP → learner band ladder
-- ---------------------------------------------------------------------------
create or replace function public.level_for_xp(p_xp int)
returns learner_band
language sql
immutable
as $$
  select case
    when p_xp < 600  then 'B1_low'::learner_band
    when p_xp < 1400 then 'B1_mid'::learner_band
    when p_xp < 2400 then 'B1_high'::learner_band
    when p_xp < 3600 then 'B1_plus'::learner_band
    when p_xp < 5000 then 'B2_entry'::learner_band
    when p_xp < 6800 then 'B2_developing'::learner_band
    else 'B2_solid'::learner_band
  end;
$$;

-- ---------------------------------------------------------------------------
-- XP ledger (internal only — clients must not be able to mint XP)
-- ---------------------------------------------------------------------------
create or replace function public.award_xp(
  p_user      uuid,
  p_source    xp_source,
  p_points    int,
  p_ref_type  text default null,
  p_ref_id    uuid default null,
  p_note      text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
begin
  if p_points = 0 or p_user is null then
    return 0;
  end if;

  insert into public.xp_events (user_id, source, points, ref_type, ref_id, note)
  values (p_user, p_source, p_points, p_ref_type, p_ref_id, p_note);

  update public.profiles
     set xp_total = greatest(0, xp_total + p_points),
         learner_band = public.level_for_xp(greatest(0, xp_total + p_points))
   where id = p_user
  returning xp_total into v_total;

  return coalesce(v_total, 0);
end;
$$;

revoke all on function public.award_xp(uuid, xp_source, int, text, uuid, text) from public;
revoke all on function public.award_xp(uuid, xp_source, int, text, uuid, text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Skill meters
-- ---------------------------------------------------------------------------
create or replace function public.touch_skill(
  p_user   uuid,
  p_skill  skill_area,
  p_delta  numeric,
  p_xp     int default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.skill_levels (user_id, skill, score, xp, lessons_completed)
  values (p_user, p_skill, greatest(0, least(100, p_delta)), p_xp, 0)
  on conflict (user_id, skill) do update
    set score = greatest(0, least(100, public.skill_levels.score + p_delta)),
        xp = public.skill_levels.xp + p_xp,
        updated_at = now();
end;
$$;

revoke all on function public.touch_skill(uuid, skill_area, numeric, int) from public;
revoke all on function public.touch_skill(uuid, skill_area, numeric, int) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Streaks
-- ---------------------------------------------------------------------------
create or replace function public.record_activity(
  p_user uuid,
  p_day  date default current_date
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_streak  int;
begin
  if p_user <> auth.uid() and auth.role() <> 'service_role' then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;

  select * into v_profile from public.profiles where id = p_user for update;
  if not found then
    return 0;
  end if;

  if v_profile.last_active_on is null then
    v_streak := 1;
  elsif p_day = v_profile.last_active_on then
    return v_profile.streak_days;
  elsif p_day = v_profile.last_active_on + 1 then
    v_streak := v_profile.streak_days + 1;
  elsif p_day > v_profile.last_active_on then
    v_streak := 1;
  else
    -- Back-dated activity never rewinds the streak.
    return v_profile.streak_days;
  end if;

  update public.profiles
     set streak_days = v_streak,
         longest_streak = greatest(longest_streak, v_streak),
         last_active_on = greatest(coalesce(last_active_on, p_day), p_day)
   where id = p_user;

  if v_streak > 0 and v_streak % 7 = 0 then
    perform public.award_xp(p_user, 'streak', 50, 'streak', null,
      format('%s-day streak', v_streak));
  end if;

  return v_streak;
end;
$$;

revoke all on function public.record_activity(uuid, date) from public;
grant execute on function public.record_activity(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- New auth user → profile, skill meters, enrollment
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.skill_levels (user_id, skill)
  select new.id, s
  from unnest(array['grammar','vocabulary','listening','reading','speaking','writing']::skill_area[]) as s
  on conflict do nothing;

  insert into public.enrollments (user_id, course_id)
  select new.id, c.id
  from public.courses c
  where c.published
  order by c.total_hours desc
  limit 1
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Rewards: lesson completion, evaluated speaking / writing, checkpoints
-- ---------------------------------------------------------------------------
create or replace function public.reward_lesson_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson public.lessons;
begin
  if new.status <> 'completed' or coalesce(old.status, 'not_started'::progress_status) = 'completed' then
    return new;
  end if;

  select * into v_lesson from public.lessons where id = new.lesson_id;
  if not found then
    return new;
  end if;

  perform public.award_xp(new.user_id, 'lesson', v_lesson.xp_reward, 'lesson', v_lesson.id, v_lesson.title);
  perform public.touch_skill(new.user_id, v_lesson.primary_skill, 2.5, v_lesson.xp_reward);
  perform public.record_activity(new.user_id);

  update public.enrollments e
     set current_lesson_number = greatest(e.current_lesson_number, v_lesson.lesson_number + 1)
   where e.user_id = new.user_id
     and e.course_id = v_lesson.course_id;

  return new;
end;
$$;

drop trigger if exists lesson_progress_reward on public.lesson_progress;
create trigger lesson_progress_reward
  after insert or update of status on public.lesson_progress
  for each row execute function public.reward_lesson_completion();

create or replace function public.reward_speaking_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.speaking_tasks;
begin
  if new.status <> 'evaluated'
     or coalesce(old.status, 'draft'::attempt_status) = 'evaluated' then
    return new;
  end if;

  select * into v_task from public.speaking_tasks where id = new.task_id;

  perform public.award_xp(
    new.user_id, 'speaking', coalesce(v_task.xp_reward, 40), 'speaking_attempt', new.id,
    coalesce(v_task.title, 'Speaking task')
  );
  perform public.touch_skill(new.user_id, 'speaking', coalesce(new.overall, 60) / 20.0, coalesce(v_task.xp_reward, 40));
  perform public.record_activity(new.user_id);

  return new;
end;
$$;

drop trigger if exists speaking_attempt_reward on public.speaking_attempts;
create trigger speaking_attempt_reward
  after insert or update of status on public.speaking_attempts
  for each row execute function public.reward_speaking_attempt();

create or replace function public.reward_writing_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.writing_tasks;
begin
  if new.status <> 'evaluated'
     or coalesce(old.status, 'draft'::attempt_status) = 'evaluated' then
    return new;
  end if;

  select * into v_task from public.writing_tasks where id = new.task_id;

  perform public.award_xp(
    new.user_id, 'writing', coalesce(v_task.xp_reward, 40), 'writing_submission', new.id,
    coalesce(v_task.title, 'Writing task')
  );
  perform public.touch_skill(new.user_id, 'writing', coalesce(new.overall, 60) / 20.0, coalesce(v_task.xp_reward, 40));
  perform public.record_activity(new.user_id);

  return new;
end;
$$;

drop trigger if exists writing_submission_reward on public.writing_submissions;
create trigger writing_submission_reward
  after insert or update of status on public.writing_submissions
  for each row execute function public.reward_writing_submission();

create or replace function public.reward_checkpoint()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'evaluated'
     and coalesce(old.status, 'draft'::attempt_status) <> 'evaluated' then
    perform public.award_xp(new.user_id, 'checkpoint', 150, 'checkpoint_attempt', new.id,
      'Checkpoint completed');
    perform public.record_activity(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists checkpoint_reward on public.checkpoint_attempts;
create trigger checkpoint_reward
  after insert or update of status on public.checkpoint_attempts
  for each row execute function public.reward_checkpoint();

-- ---------------------------------------------------------------------------
-- Vocabulary SRS: 1 → 3 → 7 → 14 → 30 → 60 day ladder
-- ---------------------------------------------------------------------------
create or replace function public.review_vocab_card(
  p_card_id uuid,
  p_grade   review_grade
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_card      public.vocab_cards;
  v_ladder    int[] := array[1, 3, 7, 14, 30, 60];
  v_step      smallint;
  v_interval  int;
  v_ease      numeric(3,2);
  v_lapses    int;
  v_due       timestamptz;
  v_points    int;
begin
  select * into v_card from public.vocab_cards where id = p_card_id and user_id = auth.uid();
  if not found then
    raise exception 'Card not found' using errcode = 'no_data_found';
  end if;

  v_step     := v_card.ladder_step;
  v_ease     := v_card.ease;
  v_lapses   := v_card.lapses;

  case p_grade
    when 'again' then
      v_step := 0;
      v_interval := 1;
      v_ease := greatest(1.30, v_ease - 0.20);
      v_lapses := v_lapses + 1;
      v_points := 0;
    when 'hard' then
      v_step := greatest(0, v_step);
      v_interval := v_ladder[least(v_step + 1, 6)];
      v_ease := greatest(1.30, v_ease - 0.05);
      v_points := 1;
    when 'good' then
      v_step := least(v_step + 1, 5);
      v_interval := v_ladder[v_step + 1];
      v_points := 2;
    when 'easy' then
      v_step := least(v_step + 2, 5);
      v_interval := v_ladder[v_step + 1];
      v_ease := least(3.50, v_ease + 0.10);
      v_points := 3;
  end case;

  -- 'hard' keeps the learner on the same rung but asks again tomorrow.
  if p_grade = 'hard' then
    v_interval := greatest(1, (v_ladder[least(v_step + 1, 6)] / 2));
  end if;

  v_due := now() + make_interval(days => v_interval);

  update public.vocab_cards
     set ladder_step = v_step,
         interval_days = v_interval,
         ease = v_ease,
         lapses = v_lapses,
         reps = reps + 1,
         due_at = v_due,
         updated_at = now()
   where id = v_card.id;

  insert into public.vocab_reviews (user_id, card_id, vocab_item_id, grade, interval_days, due_at)
  values (v_card.user_id, v_card.id, v_card.vocab_item_id, p_grade, v_interval, v_due);

  if v_points > 0 then
    perform public.award_xp(v_card.user_id, 'vocab_review', v_points, 'vocab_item', v_card.vocab_item_id,
      format('Reviewed: %s', p_grade));
  end if;

  perform public.record_activity(v_card.user_id);

  return jsonb_build_object(
    'card_id', v_card.id,
    'grade', p_grade,
    'ladder_step', v_step,
    'interval_days', v_interval,
    'due_at', v_due,
    'xp', v_points
  );
end;
$$;

grant execute on function public.review_vocab_card(uuid, review_grade) to authenticated;

-- ---------------------------------------------------------------------------
-- Card creation + due queue
-- ---------------------------------------------------------------------------
create or replace function public.ensure_vocab_cards(p_course_id uuid default null)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_created int;
begin
  with new_cards as (
    insert into public.vocab_cards (user_id, vocab_item_id, card_kind, due_at)
    select auth.uid(), vi.id, 'definition', now()
    from public.vocab_items vi
    join public.vocab_decks vd on vd.id = vi.deck_id
    where (p_course_id is null or vd.course_id = p_course_id)
    on conflict (user_id, vocab_item_id, card_kind) do nothing
    returning 1
  )
  select count(*) into v_created from new_cards;

  return coalesce(v_created, 0);
end;
$$;

grant execute on function public.ensure_vocab_cards(uuid) to authenticated;

create or replace function public.get_due_cards(p_limit int default 20)
returns table (
  card_id      uuid,
  vocab_item_id uuid,
  term         text,
  part_of_speech text,
  ipa          text,
  definition   text,
  example      text,
  collocations text[],
  translation_es text,
  deck_slug    text,
  deck_title   text,
  ladder_step  smallint,
  due_at       timestamptz
)
language sql
security invoker
stable
as $$
  select c.id,
         vi.id,
         vi.term,
         vi.part_of_speech,
         vi.ipa,
         vi.definition,
         vi.example,
         vi.collocations,
         vi.translation_es,
         vd.slug,
         vd.title,
         c.ladder_step,
         c.due_at
  from public.vocab_cards c
  join public.vocab_items vi on vi.id = c.vocab_item_id
  join public.vocab_decks vd on vd.id = vi.deck_id
  where c.user_id = auth.uid()
    and not c.suspended
    and c.due_at <= now()
  order by c.due_at
  limit least(coalesce(p_limit, 20), 100);
$$;

grant execute on function public.get_due_cards(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard payload
-- ---------------------------------------------------------------------------
create or replace function public.get_learner_dashboard()
returns jsonb
language sql
security invoker
stable
as $$
  with me as (
    select * from public.profiles where id = auth.uid()
  ),
  next_lesson as (
    select l.id, l.lesson_number, l.title, l.can_do, m.title as module_title
    from public.enrollments e
    join public.lessons l on l.course_id = e.course_id and l.lesson_number = e.current_lesson_number
    join public.modules m on m.id = l.module_id
    where e.user_id = auth.uid()
    limit 1
  )
  select jsonb_build_object(
    'profile', to_jsonb(me) - 'email',
    'xp_total', me.xp_total,
    'learner_band', me.learner_band,
    'streak_days', me.streak_days,
    'skills', coalesce((
      select jsonb_object_agg(sl.skill, jsonb_build_object('score', sl.score, 'lessons', sl.lessons_completed))
      from public.skill_levels sl where sl.user_id = auth.uid()
    ), '{}'::jsonb),
    'due_cards', (select count(*) from public.vocab_cards c
                  where c.user_id = auth.uid() and not c.suspended and c.due_at <= now()),
    'lessons_completed', (select count(*) from public.lesson_progress lp
                          where lp.user_id = auth.uid() and lp.status = 'completed'),
    'next_lesson', (select to_jsonb(nl) from next_lesson nl),
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object('code', b.code, 'title', b.title, 'earned_at', ub.earned_at))
      from public.user_badges ub join public.badges b on b.id = ub.badge_id
      where ub.user_id = auth.uid()
    ), '[]'::jsonb)
  )
  from me;
$$;

grant execute on function public.get_learner_dashboard() to authenticated;

-- ---------------------------------------------------------------------------
-- Badge evaluation (criteria are declared on public.badges.criteria)
-- ---------------------------------------------------------------------------
create or replace function public.evaluate_badges()
returns setof text
language plpgsql
security invoker
set search_path = public
as $$
declare
  b        public.badges;
  earned   boolean;
  v_score  numeric;
begin
  for b in select * from public.badges loop
    continue when exists (
      select 1 from public.user_badges ub where ub.user_id = auth.uid() and ub.badge_id = b.id
    );

    earned := false;

    case b.criteria ->> 'type'
      when 'speaking_seconds' then
        earned := exists (
          select 1 from public.speaking_attempts sa
          where sa.user_id = auth.uid()
            and sa.status = 'evaluated'
            and coalesce(sa.duration_seconds, 0) >= coalesce((b.criteria ->> 'seconds')::int, 120)
        );
      when 'writing_tasks' then
        earned := (
          select count(*) from public.writing_submissions ws
          where ws.user_id = auth.uid() and ws.status = 'evaluated'
        ) >= coalesce((b.criteria ->> 'count')::int, 1);
      when 'streak_days' then
        select streak_days into v_score from public.profiles where id = auth.uid();
        earned := coalesce(v_score, 0) >= coalesce((b.criteria ->> 'days')::int, 7);
      when 'collocations' then
        earned := (
          select count(*) from public.vocab_reviews vr
          where vr.user_id = auth.uid() and vr.grade in ('good', 'easy')
        ) >= coalesce((b.criteria ->> 'count')::int, 100);
      else
        earned := false;
    end case;

    if earned then
      insert into public.user_badges (user_id, badge_id) values (auth.uid(), b.id)
      on conflict do nothing;
      perform public.award_xp(auth.uid(), 'badge', b.xp_reward, 'badge', b.id, b.title);
      return next b.code;
    end if;
  end loop;
end;
$$;

grant execute on function public.evaluate_badges() to authenticated;

-- ---------------------------------------------------------------------------
-- Weekly report snapshot
-- ---------------------------------------------------------------------------
create or replace function public.build_weekly_report(p_week_start date default (current_date - ((extract(dow from current_date)::int + 6) % 7)))
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_end     date := p_week_start + 6;
  v_minutes int;
  v_words   int;
  v_recs    int;
  v_writes  int;
  v_weak    skill_area;
  v_row     public.weekly_reports;
begin
  select coalesce(sum(l.duration_minutes), 0) into v_minutes
  from public.lesson_progress lp
  join public.lessons l on l.id = lp.lesson_id
  where lp.user_id = v_uid and lp.status = 'completed'
    and lp.completed_at::date between p_week_start and v_end;

  select count(*) into v_words
  from public.vocab_reviews vr
  where vr.user_id = v_uid and vr.reviewed_at::date between p_week_start and v_end;

  select count(*) into v_recs
  from public.speaking_attempts sa
  where sa.user_id = v_uid and sa.created_at::date between p_week_start and v_end;

  select count(*) into v_writes
  from public.writing_submissions ws
  where ws.user_id = v_uid and ws.created_at::date between p_week_start and v_end;

  select skill into v_weak
  from public.skill_levels
  where user_id = v_uid
  order by score asc
  limit 1;

  insert into public.weekly_reports (user_id, week_start, study_minutes, words_learned, recordings, writing_tasks, weakest_skill, payload)
  values (
    v_uid, p_week_start, v_minutes, v_words, v_recs, v_writes, v_weak,
    jsonb_build_object('week_end', v_end, 'generated_at', now())
  )
  on conflict (user_id, week_start) do update
    set study_minutes = excluded.study_minutes,
        words_learned = excluded.words_learned,
        recordings = excluded.recordings,
        writing_tasks = excluded.writing_tasks,
        weakest_skill = excluded.weakest_skill,
        payload = excluded.payload
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

grant execute on function public.build_weekly_report(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.courses           enable row level security;
alter table public.modules           enable row level security;
alter table public.lessons           enable row level security;
alter table public.lesson_blocks     enable row level security;
alter table public.practice_items    enable row level security;
alter table public.content_inputs    enable row level security;
alter table public.speaking_tasks    enable row level security;
alter table public.writing_tasks     enable row level security;
alter table public.vocab_decks       enable row level security;
alter table public.vocab_items       enable row level security;
alter table public.lesson_vocab      enable row level security;
alter table public.checkpoints       enable row level security;
alter table public.badges            enable row level security;

alter table public.profiles            enable row level security;
alter table public.enrollments         enable row level security;
alter table public.lesson_progress     enable row level security;
alter table public.practice_attempts   enable row level security;
alter table public.vocab_cards         enable row level security;
alter table public.vocab_reviews       enable row level security;
alter table public.speaking_attempts   enable row level security;
alter table public.writing_submissions enable row level security;
alter table public.checkpoint_attempts enable row level security;
alter table public.xp_events           enable row level security;
alter table public.skill_levels        enable row level security;
alter table public.user_badges         enable row level security;
alter table public.weekly_reports      enable row level security;
alter table public.daily_sessions      enable row level security;

-- ---------------------------------------------------------------------------
-- Catalogue is readable without an account (course landing page).
-- The full lesson body requires a session.
-- ---------------------------------------------------------------------------
drop policy if exists "public can read courses" on public.courses;
create policy "public can read courses" on public.courses
  for select to anon, authenticated using (published);

drop policy if exists "public can read modules" on public.modules;
create policy "public can read modules" on public.modules
  for select to anon, authenticated using (true);

drop policy if exists "public can read badges" on public.badges;
create policy "public can read badges" on public.badges
  for select to anon, authenticated using (true);

do $$
declare
  t text;
begin
  foreach t in array array[
    'lessons', 'lesson_blocks', 'practice_items', 'content_inputs', 'speaking_tasks',
    'writing_tasks', 'vocab_decks', 'vocab_items', 'lesson_vocab', 'checkpoints'
  ] loop
    execute format('drop policy if exists "signed-in can read %1$s" on public.%1$I', t);
    execute format(
      'create policy "signed-in can read %1$s" on public.%1$I for select to authenticated using (true)', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Learner tables: strictly own rows
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  cols text;
begin
  foreach t in array array[
    'enrollments', 'lesson_progress', 'practice_attempts', 'vocab_cards', 'vocab_reviews',
    'speaking_attempts', 'writing_submissions', 'checkpoint_attempts', 'xp_events',
    'weekly_reports', 'daily_sessions'
  ] loop
    execute format('drop policy if exists "own rows select" on public.%I', t);
    execute format('create policy "own rows select" on public.%I for select to authenticated using (user_id = auth.uid())', t);

    execute format('drop policy if exists "own rows insert" on public.%I', t);
    execute format('create policy "own rows insert" on public.%I for insert to authenticated with check (user_id = auth.uid())', t);

    execute format('drop policy if exists "own rows update" on public.%I', t);
    execute format('create policy "own rows update" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);

    execute format('drop policy if exists "own rows delete" on public.%I', t);
    execute format('create policy "own rows delete" on public.%I for delete to authenticated using (user_id = auth.uid())', t);
  end loop;
end;
$$;

drop policy if exists "own skill meters select" on public.skill_levels;
create policy "own skill meters select" on public.skill_levels
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own badges select" on public.user_badges;
create policy "own badges select" on public.user_badges
  for select to authenticated using (user_id = auth.uid());

-- profiles: read + update own; insert only their own id (trigger normally does it)
drop policy if exists "own profile select" on public.profiles;
create policy "own profile select" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert" on public.profiles
  for insert to authenticated with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants (Supabase default privileges already cover most of this; being
-- explicit keeps the contract readable)
-- ---------------------------------------------------------------------------
grant select on public.courses, public.modules, public.badges to anon, authenticated;
grant select on public.lessons, public.lesson_blocks, public.practice_items, public.content_inputs,
                public.speaking_tasks, public.writing_tasks, public.vocab_decks, public.vocab_items,
                public.lesson_vocab, public.checkpoints to authenticated;

grant select, insert, update, delete on
  public.enrollments, public.lesson_progress, public.practice_attempts, public.vocab_cards,
  public.vocab_reviews, public.speaking_attempts, public.writing_submissions,
  public.checkpoint_attempts, public.weekly_reports, public.daily_sessions
  to authenticated;

grant select on public.xp_events, public.skill_levels, public.user_badges to authenticated;
grant select, insert, update on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: recordings live under <user-id>/<file>, private bucket
-- ---------------------------------------------------------------------------
drop policy if exists "recordings own read" on storage.objects;
create policy "recordings own read" on storage.objects
  for select to authenticated
  using (bucket_id = 'speaking-recordings' and (storage.foldername (name))[1] = auth.uid()::text);

drop policy if exists "recordings own write" on storage.objects;
create policy "recordings own write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'speaking-recordings' and (storage.foldername (name))[1] = auth.uid()::text);

drop policy if exists "recordings own update" on storage.objects;
create policy "recordings own update" on storage.objects
  for update to authenticated
  using (bucket_id = 'speaking-recordings' and (storage.foldername (name))[1] = auth.uid()::text);

drop policy if exists "recordings own delete" on storage.objects;
create policy "recordings own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'speaking-recordings' and (storage.foldername (name))[1] = auth.uid()::text);

-- Two checked versions of an optional personal-sentence item. Older attempts
-- remain untouched; the two-version limit begins with this feature.
create table if not exists public.week_sentence_practice (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_number smallint not null check (week_number between 1 and 4),
  item_id text not null check (length(item_id) between 1 and 30),
  kind text not null check (kind in ('grammar-use-it', 'vocabulary-sentence')),
  first_answer text,
  first_feedback jsonb,
  first_on_target boolean,
  second_answer text,
  second_feedback jsonb,
  second_on_target boolean,
  -- An unfinished check keeps the learner's words, even if the provider fails.
  draft_answer text,
  claim_token uuid,
  claim_slot smallint check (claim_slot in (1, 2)),
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_number, item_id),
  check ((first_answer is null and first_feedback is null and first_on_target is null)
      or (first_answer is not null and first_feedback is not null and first_on_target is not null)),
  check ((second_answer is null and second_feedback is null and second_on_target is null)
      or (first_answer is not null and second_answer is not null and second_feedback is not null and second_on_target is not null)),
  check ((claim_token is null and claim_slot is null and claimed_at is null)
      or (claim_token is not null and claim_slot is not null and claimed_at is not null and draft_answer is not null))
);

alter table public.week_sentence_practice enable row level security;
revoke all on public.week_sentence_practice from public, anon, authenticated;
grant select on public.week_sentence_practice to authenticated;
grant all on public.week_sentence_practice to service_role;
drop policy if exists "read own sentence practice" on public.week_sentence_practice;
create policy "read own sentence practice" on public.week_sentence_practice
  for select to authenticated using (user_id = auth.uid());

-- The service-only claim holds one slot while AI is running. The row lock makes
-- simultaneous tabs share the same two-check limit; the browser cannot pick a
-- later version or write marks. A stale lease can be retried after five minutes.
create or replace function public.claim_week_sentence_check(
  p_user_id uuid, p_week_number smallint, p_item_id text, p_kind text,
  p_answer text, p_version smallint
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_row public.week_sentence_practice%rowtype;
  v_slot smallint;
  v_token uuid := gen_random_uuid();
begin
  if p_user_id is null or p_week_number is null or p_week_number not between 1 and 4
      or p_item_id is null or p_kind is null or p_version is null or p_version not in (1, 2) or p_answer is null
      or length(btrim(p_answer)) = 0 or length(p_answer) > 600
      or (p_kind = 'vocabulary-sentence' and length(p_answer) > 500)
      or not (
        (p_kind = 'grammar-use-it' and p_item_id ~ ('^W' || p_week_number::text || '-U[12]$'))
        or (p_kind = 'vocabulary-sentence' and p_item_id ~ ('^V' || p_week_number::text || '-S[12]$'))
      ) then
    raise exception 'Invalid sentence check' using errcode = '22023';
  end if;

  insert into public.week_sentence_practice (user_id, week_number, item_id, kind)
    values (p_user_id, p_week_number, p_item_id, p_kind)
    on conflict (user_id, week_number, item_id) do nothing;
  select * into v_row from public.week_sentence_practice
    where user_id = p_user_id and week_number = p_week_number and item_id = p_item_id
    for update;
  if v_row.kind <> p_kind then raise exception 'Sentence kind mismatch' using errcode = '22023'; end if;
  if v_row.second_answer is not null then return jsonb_build_object('status', 'limit'); end if;
  if v_row.claim_token is not null and v_row.claimed_at > clock_timestamp() - interval '5 minutes' then
    return jsonb_build_object('status', 'busy');
  end if;
  v_slot := case when v_row.first_answer is null then 1 else 2 end;
  if p_version <> v_slot then return jsonb_build_object('status', 'stale'); end if;

  update public.week_sentence_practice
    set draft_answer = p_answer, claim_token = v_token, claim_slot = v_slot,
        claimed_at = clock_timestamp(), updated_at = clock_timestamp()
    where user_id = p_user_id and week_number = p_week_number and item_id = p_item_id;
  return jsonb_build_object(
    'status', 'claimed', 'claimToken', v_token, 'version', v_slot,
    'previous', case when v_slot = 2 then jsonb_build_object(
      'answer', v_row.first_answer, 'feedback', v_row.first_feedback, 'onTarget', v_row.first_on_target
    ) else null end
  );
end $$;

-- Finish and the existing practice mark are written in the same transaction.
-- A lost/expired claim cannot overwrite another check or consume a third slot.
create or replace function public.finish_week_sentence_check(
  p_user_id uuid, p_week_number smallint, p_item_id text, p_claim_token uuid,
  p_on_target boolean, p_feedback jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_row public.week_sentence_practice%rowtype;
  v_slot smallint;
  v_answer text;
begin
  select * into v_row from public.week_sentence_practice
    where user_id = p_user_id and week_number = p_week_number and item_id = p_item_id
    for update;
  if not found or v_row.claim_token is distinct from p_claim_token or p_claim_token is null then
    return jsonb_build_object('status', 'expired');
  end if;
  if p_on_target is null or jsonb_typeof(p_feedback) is distinct from 'object'
      or nullif(btrim(p_feedback->>'corrected'), '') is null then
    raise exception 'Invalid sentence feedback' using errcode = '22023';
  end if;
  v_slot := v_row.claim_slot;
  v_answer := v_row.draft_answer;
  if v_slot = 1 and v_row.first_answer is null then
    update public.week_sentence_practice
      set first_answer = v_answer, first_feedback = p_feedback, first_on_target = p_on_target,
          draft_answer = null, claim_token = null, claim_slot = null, claimed_at = null,
          updated_at = clock_timestamp()
      where user_id = p_user_id and week_number = p_week_number and item_id = p_item_id
      returning * into v_row;
  elsif v_slot = 2 and v_row.first_answer is not null and v_row.second_answer is null then
    update public.week_sentence_practice
      set second_answer = v_answer, second_feedback = p_feedback, second_on_target = p_on_target,
          draft_answer = null, claim_token = null, claim_slot = null, claimed_at = null,
          updated_at = clock_timestamp()
      where user_id = p_user_id and week_number = p_week_number and item_id = p_item_id
      returning * into v_row;
  else
    raise exception 'Sentence check slot is no longer available';
  end if;

  if v_row.kind = 'grammar-use-it' then
    insert into public.week_grammar_attempts(user_id, week_number, item_id, answer, correct)
      values (p_user_id, p_week_number, p_item_id, to_jsonb(v_answer), p_on_target);
  else
    insert into public.week_vocabulary_attempts(user_id, week_number, item_id, answer, correct)
      values (p_user_id, p_week_number, p_item_id, v_answer, p_on_target);
  end if;

  return jsonb_build_object(
    'status', 'completed', 'version', v_slot,
    'first', jsonb_build_object('answer', v_row.first_answer, 'feedback', v_row.first_feedback, 'onTarget', v_row.first_on_target),
    'second', case when v_row.second_answer is not null then jsonb_build_object(
      'answer', v_row.second_answer, 'feedback', v_row.second_feedback, 'onTarget', v_row.second_on_target
    ) else null end
  );
end $$;

-- A failed or refused check does not consume a version. Keep its draft for a
-- reload and release only the exact lease this request owns.
create or replace function public.release_week_sentence_check(
  p_user_id uuid, p_week_number smallint, p_item_id text, p_claim_token uuid
) returns void
language sql security definer set search_path = pg_catalog, public
as $$
  update public.week_sentence_practice
    set claim_token = null, claim_slot = null, claimed_at = null, updated_at = clock_timestamp()
    where user_id = p_user_id and week_number = p_week_number and item_id = p_item_id
      and claim_token = p_claim_token and p_claim_token is not null;
$$;

revoke all on function public.claim_week_sentence_check(uuid, smallint, text, text, text, smallint) from public, anon, authenticated;
revoke all on function public.finish_week_sentence_check(uuid, smallint, text, uuid, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.release_week_sentence_check(uuid, smallint, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_week_sentence_check(uuid, smallint, text, text, text, smallint) to service_role;
grant execute on function public.finish_week_sentence_check(uuid, smallint, text, uuid, boolean, jsonb) to service_role;
grant execute on function public.release_week_sentence_check(uuid, smallint, text, uuid) to service_role;

-- Add only this table to the existing deletion function, preserving all other
-- branches (including the speaking recording paths). Works before or after 0060.
do $$
declare
  definition text;
  anchor text := 'return jsonb_build_object(';
  branch text := 'if to_regclass(''public.week_sentence_practice'') is not null then '
    || 'execute ''delete from public.week_sentence_practice where user_id = $1'' using v_uid; '
    || 'end if;';
begin
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into definition;
  if position('public.week_sentence_practice' in definition) = 0 then
    if position(anchor in definition) = 0 then raise exception 'Deletion RPC anchor missing'; end if;
    execute replace(definition, anchor, branch || chr(10) || '  ' || anchor);
  end if;
  if position('public.week_sentence_practice' in pg_get_functiondef('public.delete_my_learning_data()'::regprocedure)) = 0 then
    raise exception 'delete_my_learning_data() does not clear week_sentence_practice';
  end if;
end $$;

notify pgrst, 'reload schema';

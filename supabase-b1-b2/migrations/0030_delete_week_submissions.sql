-- Include weekly model unlocks in the atomic learning-data deletion RPC.
do $$
declare
  definition text;
  anchor text := 'delete from public.error_review_cards where user_id = v_uid;';
begin
  select pg_get_functiondef('public.delete_my_learning_data()'::regprocedure) into definition;
  if position('public.week_output_submissions' in definition) = 0 then
    if position(anchor in definition) = 0 then
      raise exception 'Cannot safely update delete_my_learning_data: expected statement missing';
    end if;
    definition := replace(definition, anchor,
      'delete from public.week_output_submissions where user_id = v_uid;' || chr(10) || '  ' || anchor);
    execute definition;
  end if;
end $$;

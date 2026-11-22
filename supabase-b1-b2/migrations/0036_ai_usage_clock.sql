-- Sample the clock after acquiring the quota lock, including across midnight
-- or a concurrent manual reset. Preserve the same clock basis in status.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.get_ai_usage_status()'::regprocedure) into definition;
  if position('v_now timestamptz := now()' in definition) = 0 then raise exception 'Unexpected status definition'; end if;
  execute replace(definition, 'v_now timestamptz := now()', 'v_now timestamptz := clock_timestamp()');
  select pg_get_functiondef('public.consume_ai_usage(text,integer)'::regprocedure) into definition;
  if position('v_now timestamptz := clock_timestamp()' in definition) = 0 or position('v_status := public.get_ai_usage_status();' in definition) = 0 then raise exception 'Unexpected consume definition'; end if;
  definition := replace(definition, 'v_now timestamptz := clock_timestamp()', 'v_now timestamptz');
  definition := replace(definition, 'v_status := public.get_ai_usage_status();', 'v_now := clock_timestamp();' || chr(10) || '  v_status := public.get_ai_usage_status();');
  execute definition;
end $$;

-- Snapshot obtained from the authorized live project before 0038/0039.
-- verify_app_schema is a declared-object guard, not a full schema diff.
\set ON_ERROR_STOP on
do $$
declare actual jsonb := public.verify_app_schema();
  expected jsonb := '{"checked":{"tables":49,"buckets":2,"columns":494,"policies":104,"triggers":13,"functions":40},"covered":true,"missing_tables":[],"missing_buckets":[],"missing_columns":[],"missing_policies":[],"missing_triggers":[],"missing_functions":[]}';
begin
  raise notice 'Fresh verify_app_schema: %', actual;
  if actual <> expected then raise exception 'Fresh schema guard differs from live snapshot: %', actual; end if;
end $$;

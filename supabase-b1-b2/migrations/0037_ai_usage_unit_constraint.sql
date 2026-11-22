-- Match the guard and consume_ai_usage contract (1–20) on drifted deployments.
alter table public.ai_usage_events drop constraint if exists ai_usage_events_units_check;
alter table public.ai_usage_events add constraint ai_usage_events_units_check check (units between 1 and 20);

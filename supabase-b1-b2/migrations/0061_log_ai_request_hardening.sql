-- Migration 0061: limit log_ai_request to trusted database roles and bound text input.
-- Attribution is always derived from the verified JWT claim via auth.uid(); no
-- caller-supplied user identifier is accepted.
create or replace function public.log_ai_request(
  p_endpoint          text,
  p_model             text,
  p_status_code       smallint,
  p_latency_ms        int,
  p_cache_hit         boolean default false,
  p_audio_seconds     int default 0,
  p_input_chars       int default 0,
  p_prompt_tokens     int default 0,
  p_completion_tokens int default 0,
  p_estimated_cost_usd numeric default 0,
  p_error_message     text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  insert into public.ai_request_logs (
    user_id, endpoint, model, status_code, latency_ms, cache_hit,
    audio_seconds, input_chars, prompt_tokens, completion_tokens,
    estimated_cost_usd, error_message
  )
  values (
    v_user_id,
    left(coalesce(p_endpoint, ''), 200),
    left(coalesce(p_model, ''), 200),
    p_status_code,
    greatest(0, coalesce(p_latency_ms, 0)),
    coalesce(p_cache_hit, false),
    greatest(0, coalesce(p_audio_seconds, 0)),
    greatest(0, coalesce(p_input_chars, 0)),
    greatest(0, coalesce(p_prompt_tokens, 0)),
    greatest(0, coalesce(p_completion_tokens, 0)),
    greatest(0, coalesce(p_estimated_cost_usd, 0)),
    left(p_error_message, 500)
  );
end;
$$;

revoke execute on function public.log_ai_request(text, text, smallint, int, boolean, int, int, int, int, numeric, text) from public, anon;
grant execute on function public.log_ai_request(text, text, smallint, int, boolean, int, int, int, int, numeric, text) to authenticated, service_role;

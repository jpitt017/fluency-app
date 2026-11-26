# `log_ai_request` live definition before migration 0061

Captured read-only from Supabase production project `ebzmkhrssgnzmixfsuso` on 2026-11-26, before migration 0061. Source: `pg_get_functiondef('public.log_ai_request(text,text,smallint,integer,boolean,integer,integer,integer,integer,numeric,text)'::regprocedure)`.

```sql
CREATE OR REPLACE FUNCTION public.log_ai_request(p_endpoint text, p_model text, p_status_code smallint, p_latency_ms integer, p_cache_hit boolean DEFAULT false, p_audio_seconds integer DEFAULT 0, p_input_chars integer DEFAULT 0, p_prompt_tokens integer DEFAULT 0, p_completion_tokens integer DEFAULT 0, p_estimated_cost_usd numeric DEFAULT 0, p_error_message text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.ai_request_logs (
    user_id, endpoint, model, status_code, latency_ms, cache_hit,
    audio_seconds, input_chars, prompt_tokens, completion_tokens,
    estimated_cost_usd, error_message
  )
  values (
    auth.uid(), p_endpoint, p_model, p_status_code, greatest(0, p_latency_ms), coalesce(p_cache_hit, false),
    greatest(0, p_audio_seconds), greatest(0, p_input_chars),
    greatest(0, p_prompt_tokens), greatest(0, p_completion_tokens),
    greatest(0, p_estimated_cost_usd), left(p_error_message, 300)
  );
end;
$function$
```

This capture is an exact record of the function definition returned by PostgreSQL. It was made before replacing the function; no trial SQL was sent to production.

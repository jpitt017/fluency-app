-- ============================================================================
-- Migration 0038: Weeks 1–4 listening audio approval state.
--
-- The four Week 1–4 listening tracks are currently synthetic ("AI trial")
-- recordings that stand in until the real voice-actor recordings exist. This
-- table is the single approval switch:
--
--   released = false  -> the week keeps saying "Audio coming soon."
--   released = true   -> /week/[n] shows the player labelled
--                        "AI voice – trial recording"
--
-- Rows are created by scripts/generate-course-audio.mjs --week <n> and start
-- unreleased with an empty audio_url. Approving a track sets audio_url,
-- captions_url and released = true.
--
-- The table holds no learner data and no answer data, so it is readable with
-- the public anon key (the learner pages render it server-side). Writes are
-- service-role only: no insert/update/delete policy is granted below.
-- ============================================================================

create table if not exists public.listening_audio_trials (
  week smallint primary key check (week between 1 and 32),
  audio_url text,
  captions_url text,
  source text not null default 'ai-trial',
  released boolean not null default false,
  model text,
  voices jsonb,
  duration_seconds numeric,
  caption_cues integer,
  generated_at timestamptz,
  released_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.listening_audio_trials is
  'One row per week: approval state and file URLs for the Weeks 1-4 listening tracks. released = false hides the player.';
comment on column public.listening_audio_trials.source is
  'Where the audio came from. "ai-trial" = synthetic stand-in that must be replaced by a voice-actor recording.';

alter table public.listening_audio_trials enable row level security;

revoke all on public.listening_audio_trials from anon, authenticated;
grant select on public.listening_audio_trials to anon, authenticated;
grant all on public.listening_audio_trials to service_role;

drop policy if exists "public can read listening audio trials" on public.listening_audio_trials;
create policy "public can read listening audio trials" on public.listening_audio_trials
  for select to anon, authenticated using (true);

drop trigger if exists listening_audio_trials_touch on public.listening_audio_trials;
create trigger listening_audio_trials_touch
  before update on public.listening_audio_trials
  for each row execute function public.touch_updated_at();

-- One row per scheduled week, unreleased. Re-running never overwrites an
-- approval that has already happened.
insert into public.listening_audio_trials (week, source, released)
values (1, 'ai-trial', false), (2, 'ai-trial', false), (3, 'ai-trial', false), (4, 'ai-trial', false)
on conflict (week) do nothing;

notify pgrst, 'reload schema';

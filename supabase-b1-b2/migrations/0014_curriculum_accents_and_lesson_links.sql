-- ============================================================================
-- Migration 0014: Link Module 2 content_inputs to Lessons 10 & 15 and backfill
-- multi-accent speaker_accents metadata across Modules 1–8 listening tracks.
-- ============================================================================

-- Fix Module 2 content_inputs lesson_id links (previously NULL due to global lesson numbers in JSON)
update public.content_inputs ci
   set lesson_id = l.id
  from public.modules m
  join public.lessons l on l.module_id = m.id
 where ci.module_id = m.id
   and m.module_number = 2
   and ci.lesson_id is null
   and (
     (ci.kind = 'listening' and l.module_lesson_number = 2) or
     (ci.kind = 'reading' and l.module_lesson_number = 7)
   );

-- Populate speaker_accents on Modules 2–8 listening inputs (Module 1 already seeded in 0010)
update public.content_inputs ci
   set speaker_accents = case m.module_number
     when 2 then '[{"speaker":"HOST","accent":"en-GB","label":"British"},{"speaker":"PRIYA","accent":"en-CA","label":"Canadian"}]'::jsonb
     when 3 then '[{"speaker":"PRESENTER","accent":"en-AU","label":"Australian"}]'::jsonb
     when 4 then '[{"speaker":"ANCHOR","accent":"en-US","label":"American"}]'::jsonb
     when 5 then '[{"speaker":"NARRATOR","accent":"en-GB","label":"British"}]'::jsonb
     when 6 then '[{"speaker":"CHAIR","accent":"en-GB","label":"British"},{"speaker":"DR OSEI","accent":"en-ZA","label":"South African"},{"speaker":"DR LEWIS","accent":"en-GB","label":"British"}]'::jsonb
     when 7 then '[{"speaker":"HOST","accent":"en-GB","label":"British"},{"speaker":"COUNCILLOR REID","accent":"en-GB","label":"British"},{"speaker":"MS KOVAC","accent":"en-US","label":"American"}]'::jsonb
     when 8 then '[{"speaker":"SPEAKER 1","accent":"en-GB","label":"British"},{"speaker":"SPEAKER 2","accent":"en-NG","label":"Nigerian"},{"speaker":"SPEAKER 3","accent":"en-IN","label":"Indian"}]'::jsonb
     else ci.speaker_accents
   end
  from public.modules m
 where ci.module_id = m.id
   and ci.kind = 'listening'
   and m.module_number between 2 and 8
   and coalesce(jsonb_array_length(ci.speaker_accents), 0) = 0;

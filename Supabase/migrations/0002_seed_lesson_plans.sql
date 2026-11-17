-- Seed a lesson plan for every session, generated from session focus fields and blocks.
-- Re-running REGENERATES every plan: `on conflict ... do update` overwrites
-- `content` and `notes`, so any hand-edits made through the teacher editor are discarded.

INSERT INTO course.lesson_plans (session_id, content, notes)
SELECT
  s.id,
  jsonb_build_object(
    'version', 1,
    'summary', coalesce(s.objectives, s.title),
    'objectives', jsonb_build_array(
      coalesce(s.objectives, s.title),
      'Produce session focus language accurately in a timed speaking task.',
      'Self-monitor one target from the prosody lab in spontaneous speech.'
    ),
    'blocks', (
      select jsonb_agg(
        jsonb_build_object(
          'number', b.block_number,
          'title', b.title,
          'window', b.start_minute || '-' || b.end_minute || ' min',
          'type', case b.block_number
                    when 1 then 'pronunciation'
                    when 2 then 'language'
                    when 3 then 'listening'
                    else 'speaking' end,
          'description', b.description,
          'focus', case b.block_number
                     when 1 then coalesce(s.pronunciation_focus, '')
                     when 2 then coalesce(s.grammar_lexis, '')
                     when 3 then coalesce(s.listening_focus, '')
                     else coalesce(s.speaking_pragmatics, '') end,
          'procedure', case b.block_number
            when 1 then jsonb_build_array(
              'Choral drill: mark and clap the stress pattern of model sentences.',
              'Focus work on sentence stress and thought-group chunking.',
              'Back-chaining drill on long thought groups.',
              'Shadow extract, record, and replay-compare against the model.'
            )
            when 2 then jsonb_build_array(
              'Guided discovery using concordance lines from the transcript.',
              'Concept-check grid and timeline analysis.',
              'Collocation grid building and choral drilling.',
              'Controlled gap-fill practice and personalized transformation.'
            )
            when 3 then jsonb_build_array(
              'Set context and predict keywords before listening.',
              'Gist listening with multiple choice comprehension.',
              'Detail listening with note-taking grid.',
              'Post-listening oral summary.'
            )
            else jsonb_build_array(
              'Task set-up and structured fluency preparation.',
              'Timed performance in pairs using prompt cards.',
              'Peer feedback and error clinic reformulations.'
            ) end,
          'materials', case b.block_number
            when 1 then jsonb_build_array('Audio extract', 'Stress-marking worksheet', 'Recorder')
            when 2 then jsonb_build_array('Concordance handout', 'Collocation grid', 'Gap-fill sheet')
            when 3 then jsonb_build_array('Listening audio', 'Note grid', 'Transcript')
            else jsonb_build_array('Prompt cards', 'Timer', 'Rubric') end
        ) order by b.block_number
      )
      from course.session_blocks b
      where b.session_id = s.id
    ),
    'key_language', coalesce((
      select jsonb_agg(trim(t.x))
      from unnest(regexp_split_to_array(coalesce(s.grammar_lexis, ''), '\.\s+')) as t(x)
      where length(trim(t.x)) > 2
    ), '[]'::jsonb),
    'listening', jsonb_build_object(
      'focus', coalesce(s.listening_focus, ''),
      'texts', jsonb_build_array('Primary authentic extract', 'Contrasting accent extract')
    ),
    'speaking', jsonb_build_object(
      'focus', coalesce(s.speaking_pragmatics, ''),
      'outcome', 'Timed performance assessed on the fluency rubric.'
    ),
    'homework', coalesce(s.homework,
      'Record an audio journal on "' || s.title || '". Self-transcribe a short extract, mark stress changes, and submit.'
    ),
    'assessment', jsonb_build_object(
      'formative', jsonb_build_array('Monitoring grid during practice', 'Prosody recording comparison'),
      'criteria', jsonb_build_array('Task achievement', 'Coherence', 'Range & Accuracy', 'Prosody')
    )
  ),
  'Auto-generated plan for "' || s.title || '" (' || m.theme || ').'
from course.sessions s
join course.modules m on m.id = s.module_id
on conflict (session_id) do update
  set content = excluded.content,
      notes   = excluded.notes;
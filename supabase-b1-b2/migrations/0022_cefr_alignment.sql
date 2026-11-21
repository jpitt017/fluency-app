-- ============================================================================
-- CEFR Alignment Map: self-contained migration from the canonical
-- two-stage-syllabus.json. Adds all new fields to the course payload and
-- expands them into the week, phase and week-detail rows.
-- ============================================================================

alter table public.syllabus_weeks
  add column if not exists cefr jsonb not null default '{}'::jsonb,
  add column if not exists grammar jsonb not null default '{}'::jsonb,
  add column if not exists mediation jsonb not null default '{}'::jsonb;

with patch(week_number, cefr, grammar, mediation) as (values
(1,'{"canDo":"tell the story of a change in my life, saying how things were before and how they are now","scale":"Sustained monologue: describing experience","level":"B1"}','{}','{}'),(2,'{"canDo":"explain a goal, my plans and a back-up plan, and ask for advice in a letter","scale":"Correspondence","level":"B1"}','{}','{}'),(3,'{"canDo":"explain the rules and routines of a shared home politely, and answer questions about them","scale":"Conversation","level":"B1"}','{}','{}'),(4,'{"canDo":"recommend a place I know, separating facts about it from my own experience","scale":"Sustained monologue: describing experience","level":"B1"}','{}','{"prompt":"A friend is visiting your town and missed the travel guide: tell them the three things they mustn''t miss and one practical tip","source":"Week 4 reading","output":"Voice message, 60 s","scale":"Relaying specific information","level":"B1","time":"10 minutes","requirement":"Recommended; not required for unlocking","requirementKind":"recommended","countsTowardsUnlocking":false,"feedback":"Instant AI feedback on the four criteria plus one line on “Did the reader get what they need?”"}'),(5,'{"canDo":"say how sure I am about what is happening or has happened, and report what others said","scale":"Informal discussion","level":"B1"}','{}','{}'),(6,'{"canDo":"describe my work or studies and pass on instructions and requests accurately","scale":"Relaying specific information","level":"B1"}','{}','{}'),(7,'{"canDo":"summarise a news story and report people''s claims with suitable reporting verbs","scale":"Reading for information and argument","level":"B1+"}','{}','{}'),(8,'{"canDo":"talk about past choices and their results, and say what I wish were different","scale":"Sustained monologue: putting a case","level":"B1+"}','{}','{"prompt":"Summarise the environment article for a neighbour who wants to know what they can do at home","source":"Week 7–8 reading","output":"Message, 60–80 words","scale":"Processing text","level":"B1","time":"10 minutes","requirement":"Recommended; not required for unlocking","requirementKind":"recommended","countsTowardsUnlocking":false,"feedback":"Instant AI feedback on the four criteria plus one line on “Did the reader get what they need?”"}'),(9,'{"canDo":"understand and give practical health advice, explaining what I have had done or arranged","scale":"Informal discussion","level":"B1+"}','{}','{}'),(10,'{"canDo":"compare two places or options with precise quantities and comparisons","scale":"Explaining data","level":"B1+"}','{}','{}'),(11,'{"canDo":"describe and review a creative work, giving my reaction and reasons","scale":"Creative writing (reviews)","level":"B1+"}','{}','{}'),(12,'{"canDo":"give a clear opinion on a moral question with reasons and an example (inversion and cleft sentences: B2+ stretch, recognise only)","scale":"Formal discussion","level":"B1+ → B2"}','{"stretch":true,"structures":"inversion and cleft sentences","marking":"Recognition-only B2+ stretch; do not flag these structures as errors."}','{"prompt":"Explain the main point of each speaker in the ethics discussion to a classmate who couldn''t listen","source":"Week 12 listening","output":"Voice message, 90 s","scale":"Mediating communication","level":"B1+","time":"10 minutes","requirement":"Recommended; not required for unlocking","requirementKind":"recommended","countsTowardsUnlocking":false,"feedback":"Instant AI feedback on the four criteria plus one line on “Did the reader get what they need?”"}'),(13,'{"canDo":"present a point of view on a global issue, using cautious language where the evidence is unclear","scale":"Addressing audiences","level":"B2"}','{}','{}'),(14,'{"canDo":"speculate about the future and say how likely different outcomes are","scale":"Sustained monologue: putting a case","level":"B2"}','{}','{}'),(15,'{"canDo":"write a clear argument that answers the other side, using concession and linking","scale":"Reports and essays","level":"B2"}','{}','{}'),(16,'{"canDo":"find and fix my most frequent errors in my own speaking and writing","scale":"Grammatical accuracy","level":"B1+"}','{}','{"prompt":"Explain a simple chart about city transport to a colleague who needs the main trend","source":"Chart (new item)","output":"Short paragraph, 80–100 words","scale":"Explaining data","level":"B1+","time":"10 minutes","requirement":"Recommended; not required for unlocking","requirementKind":"recommended","countsTowardsUnlocking":false,"feedback":"Instant AI feedback on the four criteria plus one line on “Did the reader get what they need?”"}'),(17,'{"canDo":"talk for two minutes about a decision I would change, explaining what I should or could have done","scale":"Sustained monologue: describing experience","level":"B2"}','{}','{}'),(18,'{"canDo":"write a short factual report that presents findings in an objective style","scale":"Reports and essays","level":"B2"}','{}','{}'),(19,'{"canDo":"follow a discussion about spending and identify each speaker''s opinion and attitude","scale":"Overall listening comprehension","level":"B2"}','{}','{}'),(20,'{"canDo":"write formal and informal emails that suit the reader, including a polite complaint or request","scale":"Correspondence","level":"B2"}','{}','{"prompt":"Rewrite an informal message from your manager as a clear notice for the whole team","source":"Short message (new item)","output":"Notice, 80–100 words","scale":"Processing text","level":"B2","time":"10 minutes","requirement":"Recommended; not required for unlocking","requirementKind":"recommended","countsTowardsUnlocking":false,"feedback":"Instant AI feedback on the four criteria plus one line on “Did the reader get what they need?”"}'),(21,'{"canDo":"take part in a discussion, agreeing and disagreeing politely and setting conditions","scale":"Formal discussion","level":"B2"}','{}','{}'),(22,'{"canDo":"read a longer article and pick out specific details, opinions and the writer''s purpose","scale":"Reading for information and argument","level":"B2"}','{}','{}'),(23,'{"canDo":"write a review that describes, evaluates and recommends, using varied word forms","scale":"Creative writing (reviews)","level":"B2"}','{}','{}'),(24,'{"canDo":"write a for-and-against essay that weighs both sides and reaches a conclusion","scale":"Reports and essays","level":"B2"}','{}','{"prompt":"Summarise both sides of an article about the four-day week for someone who has to make a decision","source":"Week 24 reading","output":"Summary, 100–120 words","scale":"Processing text","level":"B2","time":"10 minutes","requirement":"Recommended; not required for unlocking","requirementKind":"recommended","countsTowardsUnlocking":false,"feedback":"Instant AI feedback on the four criteria plus one line on “Did the reader get what they need?”"}'),(25,'{"canDo":"compare two options in a long turn, highlighting what matters most (fronting and emphatic structures: B2+ stretch, recognise only)","scale":"Sustained monologue: putting a case","level":"B2"}','{"stretch":true,"structures":"fronting and emphatic structures","marking":"Recognition-only B2+ stretch; do not flag these structures as errors."}','{}'),(26,'{"canDo":"understand the main points and details of an extended talk or interview at natural speed (ellipsis and substitution: B2+ stretch, recognise only)","scale":"Overall listening comprehension","level":"B2"}','{"stretch":true,"structures":"ellipsis and substitution","marking":"Recognition-only B2+ stretch; do not flag these structures as errors."}','{}'),(27,'{"canDo":"write a story or article about a past event, with a clear sequence and background detail","scale":"Creative writing","level":"B2"}','{}','{}'),(28,'{"canDo":"rewrite a short text for a different reader, changing informal language to formal","scale":"Processing text","level":"B2"}','{}','{"prompt":"Explain a news story to someone who doesn''t follow the news, including why it matters","source":"Week 28 listening or reading","output":"Voice message, 2 min","scale":"Relaying specific information","level":"B2","time":"10 minutes","requirement":"Recommended; not required for unlocking","requirementKind":"recommended","countsTowardsUnlocking":false,"feedback":"Instant AI feedback on the four criteria plus one line on “Did the reader get what they need?”"}'),(29,'{"canDo":"discuss preferences and give reasons, responding to others'' views and asking follow-up questions","scale":"Informal discussion","level":"B2"}','{}','{}'),(30,'{"canDo":"describe trends from a chart or data and say how likely future changes are","scale":"Explaining data","level":"B2"}','{}','{}'),(31,'{"canDo":"build and defend an argument in a 15-minute AI debate and a written essay","scale":"Formal discussion; Reports and essays","level":"B2"}','{}','{}'),(32,'{"canDo":"complete B2 exam-style tasks in all four skills and plan how to fix my remaining weak points","scale":"All skills (exam-style)","level":"B2"}','{}','{"prompt":"Report the key figures and the conclusion of a short report to your team","source":"Short report with a chart (new item)","output":"Summary, 120 words","scale":"Explaining data","level":"B2","time":"10 minutes","requirement":"Recommended; not required for unlocking","requirementKind":"recommended","countsTowardsUnlocking":false,"feedback":"Instant AI feedback on the four criteria plus one line on “Did the reader get what they need?”"}')
), phase_patch(stage_number, weeks, pronunciation_focus) as (values
(1,'1-4','word stress in featured words and -ed endings'),(1,'5-8','weak forms (was, were, can, have) and contractions'),(1,'9-12','sentence stress on the key information'),(1,'13-16','chunking and pausing in longer turns'),(2,'17-20','intonation for questions, lists and polite requests'),(2,'21-24','linking sounds in connected speech'),(2,'25-28','stress for contrast and emphasis'),(2,'29-32','pace and pausing in a 3-minute long turn')
), detail_patch(week_number, cefr) as (values
(1,'{"canDo":"tell the story of a change in my life, saying how things were before and how they are now","scale":"Sustained monologue: describing experience","level":"B1"}'),(2,'{"canDo":"explain a goal, my plans and a back-up plan, and ask for advice in a letter","scale":"Correspondence","level":"B1"}'),(3,'{"canDo":"explain the rules and routines of a shared home politely, and answer questions about them","scale":"Conversation","level":"B1"}'),(4,'{"canDo":"recommend a place I know, separating facts about it from my own experience","scale":"Sustained monologue: describing experience","level":"B1"}')
), course_update as (
  update public.syllabus_course doc
  set payload = payload || jsonb_build_object(
    'cefrAlignment', jsonb_build_object(
      'weeks', (
        select jsonb_agg(jsonb_build_object(
          'week_number', p.week_number,
          'cefr', p.cefr::jsonb,
          'grammar', p.grammar::jsonb,
          'mediation', p.mediation::jsonb
        ) order by p.week_number)
        from patch p
      ),
      'phases', (
        select jsonb_agg(jsonb_build_object(
          'stage_number', pp.stage_number,
          'weeks', pp.weeks,
          'pronunciationFocus', pp.pronunciation_focus
        ) order by pp.stage_number, pp.weeks)
        from phase_patch pp
      ),
      'marking', '{"summary":"Speaking and writing are marked on how well you complete the task, your vocabulary, your grammar and how clearly you organise your ideas. Feedback is instant; if you study with a teacher, they confirm or adjust it.","onTargetLevel":[{"weeks":"1–8","level":"B1"},{"weeks":"9–16","level":"B1+"},{"weeks":"17–32","level":"B2"}]}'::jsonb
    )
  )
  where doc.key = 'two-stage-b1-b2'
  returning 1
), week_update as (
  update public.syllabus_weeks w
  set cefr = patch.cefr::jsonb, grammar = patch.grammar::jsonb, mediation = patch.mediation::jsonb
  from patch where w.week_number = patch.week_number
  returning 1
), stage_update as (
  update public.syllabus_stages s
  set phases = (
    select jsonb_agg(
      case when pf.weeks is not null
        then phase.value || jsonb_build_object('pronunciationFocus', pf.pronunciation_focus)
        else phase.value end
      order by (phase.value->>'weeks')::text)
    from jsonb_array_elements(s.phases) as phase(value)
    left join phase_patch pf
      on pf.stage_number = s.stage_number and pf.weeks = phase.value->>'weeks'
  )
  returning 1
), detail_update as (
  update public.syllabus_week_details d
  set payload = payload || jsonb_build_object('cefr', detail_patch.cefr::jsonb)
  from detail_patch where d.week_number = detail_patch.week_number
  returning 1
)
select
  (select count(*) from course_update) as courses_updated,
  (select count(*) from week_update) as weeks_updated,
  (select count(*) from stage_update) as stages_updated,
  (select count(*) from detail_update) as details_updated;

notify pgrst, 'reload schema';

-- ============================================================================
-- Migration 0025: backfill missing CEFR/grammar/mediation data from the bundled
-- two-stage-syllabus.json. Safe to re-run: only empty JSON objects are filled.
-- Generated from supabase-b1-b2/content/curriculum/two-stage-syllabus.json.
-- ============================================================================

with week_patch(week_number, cefr, grammar, mediation) as (
  values
(1,'{"canDo":"tell the story of a change in my life, saying how things were before and how they are now","scale":"Sustained monologue: describing experience","level":"B1"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(2,'{"canDo":"explain a goal, my plans and a back-up plan, and ask for advice in a letter","scale":"Correspondence","level":"B1"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(3,'{"canDo":"explain the rules and routines of a shared home politely, and answer questions about them","scale":"Conversation","level":"B1"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(4,'{"canDo":"recommend a place I know, separating facts about it from my own experience","scale":"Sustained monologue: describing experience","level":"B1"}'::jsonb,'{}'::jsonb,'{"prompt":"A friend is visiting your town and missed the travel guide: tell them the three things they mustn''t miss and one practical tip","source":"Week 4 reading","output":"Voice message, 60 s","scale":"Relaying specific information","level":"B1","time":"10 minutes","requirement":"Recommended; not required for unlocking","requirementKind":"recommended","countsTowardsUnlocking":false,"feedback":"Instant AI feedback on the four criteria plus one line on “Did the reader get what they need?”"}'::jsonb),
(5,'{"canDo":"say how sure I am about what is happening or has happened, and report what others said","scale":"Informal discussion","level":"B1"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(6,'{"canDo":"describe my work or studies and pass on instructions and requests accurately","scale":"Relaying specific information","level":"B1"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(7,'{"canDo":"summarise a news story and report people''s claims with suitable reporting verbs","scale":"Reading for information and argument","level":"B1+"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(8,'{"canDo":"talk about past choices and their results, and say what I wish were different","scale":"Sustained monologue: putting a case","level":"B1+"}'::jsonb,'{}'::jsonb,'{"prompt":"Summarise the environment article for a neighbour who wants to know what they can do at home","source":"Week 7–8 reading","output":"Message, 60–80 words","scale":"Processing text","level":"B1","time":"10 minutes","requirement":"Recommended; not required for unlocking","requirementKind":"recommended","countsTowardsUnlocking":false,"feedback":"Instant AI feedback on the four criteria plus one line on “Did the reader get what they need?”"}'::jsonb),
(9,'{"canDo":"understand and give practical health advice, explaining what I have had done or arranged","scale":"Informal discussion","level":"B1+"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(10,'{"canDo":"compare two places or options with precise quantities and comparisons","scale":"Explaining data","level":"B1+"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(11,'{"canDo":"describe and review a creative work, giving my reaction and reasons","scale":"Creative writing (reviews)","level":"B1+"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(12,'{"canDo":"give a clear opinion on a moral question with reasons and an example (inversion and cleft sentences: B2+ stretch, recognise only)","scale":"Formal discussion","level":"B1+ → B2"}'::jsonb,'{"stretch":true,"structures":"inversion and cleft sentences","marking":"Recognition-only B2+ stretch; do not flag these structures as errors."}'::jsonb,'{"prompt":"Explain the main point of each speaker in the ethics discussion to a classmate who couldn''t listen","source":"Week 12 listening","output":"Voice message, 90 s","scale":"Mediating communication","level":"B1+","time":"10 minutes","requirement":"Recommended; not required for unlocking","requirementKind":"recommended","countsTowardsUnlocking":false,"feedback":"Instant AI feedback on the four criteria plus one line on “Did the reader get what they need?”"}'::jsonb),
(13,'{"canDo":"present a point of view on a global issue, using cautious language where the evidence is unclear","scale":"Addressing audiences","level":"B2"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(14,'{"canDo":"speculate about the future and say how likely different outcomes are","scale":"Sustained monologue: putting a case","level":"B2"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(15,'{"canDo":"write a clear argument that answers the other side, using concession and linking","scale":"Reports and essays","level":"B2"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(16,'{"canDo":"find and fix my most frequent errors in my own speaking and writing","scale":"Grammatical accuracy","level":"B1+"}'::jsonb,'{}'::jsonb,'{"prompt":"Explain a simple chart about city transport to a colleague who needs the main trend","source":"Chart (new item)","output":"Short paragraph, 80–100 words","scale":"Explaining data","level":"B1+","time":"10 minutes","requirement":"Recommended; not required for unlocking","requirementKind":"recommended","countsTowardsUnlocking":false,"feedback":"Instant AI feedback on the four criteria plus one line on “Did the reader get what they need?”"}'::jsonb),
(17,'{"canDo":"talk for two minutes about a decision I would change, explaining what I should or could have done","scale":"Sustained monologue: describing experience","level":"B2"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(18,'{"canDo":"write a short factual report that presents findings in an objective style","scale":"Reports and essays","level":"B2"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(19,'{"canDo":"follow a discussion about spending and identify each speaker''s opinion and attitude","scale":"Overall listening comprehension","level":"B2"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(20,'{"canDo":"write formal and informal emails that suit the reader, including a polite complaint or request","scale":"Correspondence","level":"B2"}'::jsonb,'{}'::jsonb,'{"prompt":"Rewrite an informal message from your manager as a clear notice for the whole team","source":"Short message (new item)","output":"Notice, 80–100 words","scale":"Processing text","level":"B2","time":"10 minutes","requirement":"Recommended; not required for unlocking","requirementKind":"recommended","countsTowardsUnlocking":false,"feedback":"Instant AI feedback on the four criteria plus one line on “Did the reader get what they need?”"}'::jsonb),
(21,'{"canDo":"take part in a discussion, agreeing and disagreeing politely and setting conditions","scale":"Formal discussion","level":"B2"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(22,'{"canDo":"read a longer article and pick out specific details, opinions and the writer''s purpose","scale":"Reading for information and argument","level":"B2"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(23,'{"canDo":"write a review that describes, evaluates and recommends, using varied word forms","scale":"Creative writing (reviews)","level":"B2"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(24,'{"canDo":"write a for-and-against essay that weighs both sides and reaches a conclusion","scale":"Reports and essays","level":"B2"}'::jsonb,'{}'::jsonb,'{"prompt":"Summarise both sides of an article about the four-day week for someone who has to make a decision","source":"Week 24 reading","output":"Summary, 100–120 words","scale":"Processing text","level":"B2","time":"10 minutes","requirement":"Recommended; not required for unlocking","requirementKind":"recommended","countsTowardsUnlocking":false,"feedback":"Instant AI feedback on the four criteria plus one line on “Did the reader get what they need?”"}'::jsonb),
(25,'{"canDo":"compare two options in a long turn, highlighting what matters most (fronting and emphatic structures: B2+ stretch, recognise only)","scale":"Sustained monologue: putting a case","level":"B2"}'::jsonb,'{"stretch":true,"structures":"fronting and emphatic structures","marking":"Recognition-only B2+ stretch; do not flag these structures as errors."}'::jsonb,'{}'::jsonb),
(26,'{"canDo":"understand the main points and details of an extended talk or interview at natural speed (ellipsis and substitution: B2+ stretch, recognise only)","scale":"Overall listening comprehension","level":"B2"}'::jsonb,'{"stretch":true,"structures":"ellipsis and substitution","marking":"Recognition-only B2+ stretch; do not flag these structures as errors."}'::jsonb,'{}'::jsonb),
(27,'{"canDo":"write a story or article about a past event, with a clear sequence and background detail","scale":"Creative writing","level":"B2"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(28,'{"canDo":"rewrite a short text for a different reader, changing informal language to formal","scale":"Processing text","level":"B2"}'::jsonb,'{}'::jsonb,'{"prompt":"Explain a news story to someone who doesn''t follow the news, including why it matters","source":"Week 28 listening or reading","output":"Voice message, 2 min","scale":"Relaying specific information","level":"B2","time":"10 minutes","requirement":"Recommended; not required for unlocking","requirementKind":"recommended","countsTowardsUnlocking":false,"feedback":"Instant AI feedback on the four criteria plus one line on “Did the reader get what they need?”"}'::jsonb),
(29,'{"canDo":"discuss preferences and give reasons, responding to others'' views and asking follow-up questions","scale":"Informal discussion","level":"B2"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(30,'{"canDo":"describe trends from a chart or data and say how likely future changes are","scale":"Explaining data","level":"B2"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(31,'{"canDo":"build and defend an argument in a 15-minute AI debate and a written essay","scale":"Formal discussion; Reports and essays","level":"B2"}'::jsonb,'{}'::jsonb,'{}'::jsonb),
(32,'{"canDo":"complete B2 exam-style tasks in all four skills and plan how to fix my remaining weak points","scale":"All skills (exam-style)","level":"B2"}'::jsonb,'{}'::jsonb,'{"prompt":"Report the key figures and the conclusion of a short report to your team","source":"Short report with a chart (new item)","output":"Summary, 120 words","scale":"Explaining data","level":"B2","time":"10 minutes","requirement":"Recommended; not required for unlocking","requirementKind":"recommended","countsTowardsUnlocking":false,"feedback":"Instant AI feedback on the four criteria plus one line on “Did the reader get what they need?”"}'::jsonb)
), weeks_filled as (
  update public.syllabus_weeks w
  set
    cefr = case
      when (w.cefr is null or w.cefr = '{}'::jsonb) and p.cefr <> '{}'::jsonb then p.cefr
      else w.cefr end,
    grammar = case
      when (w.grammar is null or w.grammar = '{}'::jsonb) and p.grammar <> '{}'::jsonb then p.grammar
      else w.grammar end,
    mediation = case
      when (w.mediation is null or w.mediation = '{}'::jsonb) and p.mediation <> '{}'::jsonb then p.mediation
      else w.mediation end
  from week_patch p
  where w.week_number = p.week_number
  returning w.week_number
), detail_patch(week_number, cefr) as (
  values
(1,'{"canDo":"tell the story of a change in my life, saying how things were before and how they are now","scale":"Sustained monologue: describing experience","level":"B1"}'::jsonb),
(2,'{"canDo":"explain a goal, my plans and a back-up plan, and ask for advice in a letter","scale":"Correspondence","level":"B1"}'::jsonb),
(3,'{"canDo":"explain the rules and routines of a shared home politely, and answer questions about them","scale":"Conversation","level":"B1"}'::jsonb),
(4,'{"canDo":"recommend a place I know, separating facts about it from my own experience","scale":"Sustained monologue: describing experience","level":"B1"}'::jsonb)
), details_filled as (
  update public.syllabus_week_details d
  set payload = payload || jsonb_build_object('cefr', p.cefr)
  from detail_patch p
  where d.week_number = p.week_number
    and (d.payload->'cefr' is null or d.payload->'cefr' = '{}'::jsonb)
  returning d.week_number
), phase_patch(stage_number, weeks, pronunciation_focus) as (
  values
(1,'1-4','"word stress in featured words and -ed endings"'::jsonb),
(1,'5-8','"weak forms (was, were, can, have) and contractions"'::jsonb),
(1,'9-12','"sentence stress on the key information"'::jsonb),
(1,'13-16','"chunking and pausing in longer turns"'::jsonb),
(2,'17-20','"intonation for questions, lists and polite requests"'::jsonb),
(2,'21-24','"linking sounds in connected speech"'::jsonb),
(2,'25-28','"stress for contrast and emphasis"'::jsonb),
(2,'29-32','"pace and pausing in a 3-minute long turn"'::jsonb)
), stages_filled as (
  update public.syllabus_stages s
  set phases = (
    select jsonb_agg(
      case
        when pf.pronunciation_focus is not null
          and (phase.value->'pronunciationFocus' is null or phase.value->>'pronunciationFocus' = '')
          then phase.value || jsonb_build_object('pronunciationFocus', pf.pronunciation_focus)
        else phase.value
      end
      order by (phase.value->>'weeks')
    )
    from jsonb_array_elements(s.phases) as phase(value)
    left join phase_patch pf
      on pf.stage_number = s.stage_number
     and pf.weeks = phase.value->>'weeks'
  )
  returning s.stage_number
)
select
  (select count(*) from weeks_filled) as weeks_checked,
  (select count(*) from details_filled) as details_filled,
  (select count(*) from stages_filled) as stages_checked;

notify pgrst, 'reload schema';

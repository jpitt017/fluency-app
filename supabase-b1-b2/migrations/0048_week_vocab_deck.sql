-- Give the weekly vocabulary exercises somewhere to land.
--
-- Requirement: answering a word in the weekly exercises must update that word's
-- FSRS card, so a mistake comes back sooner. Cards hang off vocab_items, and the
-- words those exercises use are not all there: weeks 1-4 draw on 72 distinct
-- words, and only a handful of them exist as vocab_items (week 1 has three of
-- eleven).
--
-- The gap is not a missing word list. The words are already authored, with the
-- learner-facing meaning, in lib/curriculum/vocabulary-meanings.json, and the
-- examples in syllabus_vocab_items. What is missing is a *deck* for them:
-- vocab_items requires a deck, and the eight existing decks are the older
-- module-1..8 course, whose "module-1" deck is a different set of words that
-- happens to share its name. Pointing week 1 at that deck would hand learners
-- cards for words they never saw.
--
-- So: one deck, built from content that is already reviewed and already on
-- screen in the vocabulary step. The definition is the authored definition —
-- not the example sentence, which would put the answer on the back of the card —
-- and the example is the authored example.
--
-- 61 of the 72 words are included, which is 40 of the 44 answers the weekly
-- exercises actually ask for.
--
-- The 11 left out are the linkers and one word-family entry (eventually, since
-- then, in order to, on the other hand, in fact, apart from that, to begin with,
-- what's more, despite, all in all, friend): they have no authored definition,
-- definition is NOT NULL, and a card with a placeholder back is worse than no
-- card.
--
-- The other 4 are collocations the gap-fill exercise asks for in an inflected or
-- expanded form that is not the authored headword (made a big decision for make a
-- big decision, invite friends round for invite (someone) round, improve my
-- skills, looking forward). Guessing the headword from the surface form is how
-- unreviewed words end up in a learner's queue, so they are left out and named
-- here rather than papered over.
--
-- The course is the stage-1 course, found by the slug 0019 gives it, with any
-- other published course as a fallback. It is not hard-coded to a required slug:
-- the live project also carries a legacy english-b1-b2 course row that no
-- migration creates, so a hard reference to one slug passes on live and fails on
-- a fresh replay. The deck is found by its own slug afterwards, so a fallback
-- pick cannot break the weekly link.
--
-- Idempotent: re-running inserts nothing new and updates nothing.
do $$
declare
  v_course uuid;
  v_deck   uuid;
begin
  select c.id into v_course
  from public.courses c
  where c.published
  order by (c.slug = 'b2-preparation-weeks-1-16') desc, c.created_at
  limit 1;

  if v_course is null then
    raise exception 'No published course; cannot attach the weekly vocabulary deck';
  end if;

  insert into public.vocab_decks (course_id, slug, title, topic, description)
  values (
    v_course,
    'weeks-01-04',
    'Weeks 1-4: words you practise in the weekly steps',
    'weekly vocabulary',
    'Built from the published weekly vocabulary so weekly practice updates the same FSRS card.'
  )
  on conflict (slug) do nothing;

  select id into v_deck from public.vocab_decks where slug = 'weeks-01-04';
  if v_deck is null then
    raise exception 'The weeks-01-04 vocabulary deck could not be created';
  end if;

  insert into public.vocab_items (deck_id, term, part_of_speech, definition, example, band)
  select
    v_deck,
    v.term,
    'phrase',
    v.definition,
    v.example,
    'B1'
  from jsonb_to_recordset($rows$[{"term":"adapt","definition":"change the way you do things to fit a new situation","example":"I had to adapt to living abroad."},
{"term":"turning point","definition":"a time when something important changes","example":"Moving to Leeds was a turning point in my life."},
{"term":"challenge","definition":"something new and difficult that needs effort","example":"I faced several challenges while I was studying abroad."},
{"term":"get used to","definition":"start to feel that something new is normal","example":"It took me a month to get used to living alone."},
{"term":"look back on","definition":"think about something in the past","example":"When I look back on my first year abroad, I remember the people I met."},
{"term":"regret","definition":"feel sorry about something you did or didn't do","example":"I've never regretted leaving my old job."},
{"term":"gradually","definition":"slowly, a little at a time","example":"My English gradually improved while I was living in York."},
{"term":"memorable","definition":"easy to remember because it was special","example":"Travelling alone was a memorable experience."},
{"term":"make a big decision","definition":"decide something important","example":"I made a big decision about my future."},
{"term":"take a risk","definition":"do something even though it might go wrong","example":"I took a risk and applied for a job abroad."},
{"term":"make a change","definition":"start doing something in a new or different way","example":"I decided to make a change and cycle to work."},
{"term":"keep in touch","definition":"continue to talk or write to someone","example":"I've kept in touch with my old school friends."},
{"term":"make progress","definition":"get better at something, step by step","example":"I've been making good progress since September."},
{"term":"take up","definition":"start a new hobby or activity","example":"I took up photography after I moved."},
{"term":"ambition","definition":"something you really want to do in your life","example":"Her ambition is to run her own restaurant."},
{"term":"goal","definition":"something you want to do and plan for","example":"My goal is to start a career in design."},
{"term":"achieve","definition":"succeed in doing something after trying hard","example":"If you practise regularly, you'll achieve your goal."},
{"term":"intend","definition":"plan to do something","example":"We intend to move to the coast next year."},
{"term":"career","definition":"the jobs you do during your working life","example":"She's going to start a career in engineering."},
{"term":"deadline","definition":"the last day or time when you can do something","example":"The deadline for applications is 30 April."},
{"term":"apply","definition":"ask formally for a job, a course or a place","example":"She's going to apply for a job at the museum."},
{"term":"look forward to","definition":"feel happy about something that is going to happen","example":"I'm looking forward to starting my new course."},
{"term":"determined","definition":"very sure you will do something, even if it's difficult","example":"He's determined to pass, so he's going to practise every day."},
{"term":"work towards","definition":"try to reach a goal, step by step","example":"I'm working towards a degree in nursing."},
{"term":"take the first step","definition":"do the first thing to start something","example":"I'll take the first step and contact the college."},
{"term":"improve your skills","definition":"get better at the things you can do","example":"This course will help you improve your skills."},
{"term":"put (something) off","definition":"decide to do something later","example":"Don't put off booking the course. With a pronoun: put it off."},
{"term":"set a goal","definition":"decide what you want to do and when","example":"I'm going to set myself a goal of reading one book a month."},
{"term":"meet a deadline","definition":"finish something on time","example":"We'll need to finish on Thursday to meet Friday's deadline."},
{"term":"success","definition":"a good result that you wanted","example":"succeed, success, successful, successfully"},
{"term":"get on with","definition":"have a friendly relationship with someone","example":"You don't have to be close friends to get on with your colleagues."},
{"term":"catch up (with)","definition":"meet someone and tell each other your news","example":"Can we meet after work and catch up? Here: exchange news."},
{"term":"arrange","definition":"plan the time and details of something","example":"We should arrange to meet outside the station."},
{"term":"routine","definition":"the usual things you do every day","example":"Try to stick to a routine during busy weeks."},
{"term":"rely on","definition":"trust someone to help you","example":"You can rely on Maria to help if there's a problem."},
{"term":"misunderstanding","definition":"a problem because people understand something in different ways","example":"We should talk and clear up the misunderstanding."},
{"term":"invite (someone) round","definition":"ask someone to visit your home","example":"Can I invite some friends round on Saturday? BrE."},
{"term":"awkward (situation)","definition":"uncomfortable or a little embarrassing","example":"It was an awkward situation, but we managed to talk it through."},
{"term":"politely","definition":"in a kind way that shows respect","example":"You can disagree politely."},
{"term":"make an effort","definition":"try hard to do something","example":"We should make an effort to welcome new colleagues."},
{"term":"have a lot in common","definition":"share many interests or opinions","example":"We have a lot in common: we both love cycling."},
{"term":"get in touch","definition":"contact someone by phone, message or email","example":"You should get in touch with the organiser."},
{"term":"come over","definition":"visit someone at their home","example":"Can you come over for coffee on Saturday?"},
{"term":"keep a promise","definition":"do what you said you would do","example":"You should keep a promise even if it's difficult."},
{"term":"pop round","definition":"visit someone's home for a short time (informal)","example":"Can I pop round after work? Informal BrE; short visit."},
{"term":"tradition","definition":"something people in a place have done for a long time","example":"Visitors are invited to take part in a local tradition."},
{"term":"custom","definition":"something people in a place usually do","example":"The guide explained a local custom: visitors are asked to take off their shoes before they go inside."},
{"term":"destination","definition":"the place where you are going","example":"It's one of the most popular holiday destinations on the coast."},
{"term":"set off","definition":"start a journey","example":"We set off early to avoid the heavy traffic."},
{"term":"get around","definition":"travel from place to place","example":"We were given a map to help us get around the city."},
{"term":"unfamiliar","definition":"new to you; you don't know it well","example":"We were unfamiliar with the ticket system."},
{"term":"welcoming","definition":"friendly to visitors","example":"The hotel where we stayed had a welcoming atmosphere."},
{"term":"local","definition":"from or in the area where you are","example":"Local food is served in the hotel restaurant."},
{"term":"take a guided tour","definition":"visit a place with a guide who explains things","example":"We took a guided tour of the old town."},
{"term":"try the local food","definition":"eat dishes that people from the area make","example":"We were encouraged to try the local food."},
{"term":"travel light","definition":"take very little luggage","example":"We travelled light because there wasn't much room for luggage."},
{"term":"stop overnight","definition":"stay one night somewhere during a journey","example":"We stopped overnight in York before driving on."},
{"term":"miss a connection","definition":"arrive too late for your next train, bus or plane","example":"Our flight was delayed, so we missed our connection."},
{"term":"culture","definition":"the art, music and way of life of a group","example":"culture, cultural, culturally"},
{"term":"tourism","definition":"the business of people visiting places on holiday","example":"tourism, touristy"},
{"term":"break your journey","definition":"stop somewhere for a while on a long trip","example":"We broke our journey with an overnight stay in York. Mainly BrE."}]$rows$::jsonb) as v(term text, definition text, example text)
  on conflict (deck_id, term) do nothing;
end $$;

-- Guard: the deck must exist and must not be empty, or weekly practice would
-- silently stop updating any card.
do $$
declare
  v_deck uuid;
  v_count int;
begin
  select id into v_deck from public.vocab_decks where slug = 'weeks-01-04';
  if v_deck is null then
    raise exception 'The weeks-01-04 vocabulary deck is missing';
  end if;
  select count(*) into v_count from public.vocab_items where deck_id = v_deck;
  if v_count < 55 then
    raise exception 'The weeks-01-04 vocabulary deck has only % items; expected at least 55', v_count;
  end if;
end $$;

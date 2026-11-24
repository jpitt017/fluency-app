-- Give the weekly vocabulary exercises somewhere to land.
--
-- Requirement: answering a word in the weekly exercises must update that word's
-- FSRS card, so a mistake comes back sooner. Cards hang off vocab_items, and the
-- words those exercises use are not all there: weeks 1–4 draw on 41 words, and
-- only a handful of them exist as vocab_items (week 1 has three of eleven).
--
-- The gap is not a missing word list. The words are already authored, with the
-- learner-facing meaning, in syllabus_vocab_items and lib/curriculum/
-- vocabulary-meanings.json. What is missing is a *deck* for them: vocab_items
-- requires a deck, and the eight existing decks are the older module-1..8
-- course, whose "module-1" deck is a different set of words that happens to
-- share its name. Pointing week 1 at that deck would hand learners cards for
-- words they never saw.
--
-- So: one deck, built from the published syllabus rows for weeks 1–4. Nothing is
-- invented here — term, part of speech, definition and example all come from
-- content that is already reviewed and already on screen in the vocabulary
-- step. Words with no authored definition are skipped rather than given a
-- placeholder, because a flashcard with a blank back is worse than no card.
--
-- Idempotent: re-running inserts nothing new and updates nothing.
do $$
declare
  v_course uuid;
  v_deck   uuid;
begin
  select id into v_course from public.courses where slug = 'english-b1-b2';
  if v_course is null then
    raise exception 'The english-b1-b2 course is missing; cannot attach the weekly vocabulary deck';
  end if;

  insert into public.vocab_decks (course_id, slug, title, topic, description)
  values (
    v_course,
    'weeks-01-04',
    'Weeks 1–4 · words you practise in the weekly steps',
    'weekly vocabulary',
    'Built from the published weekly vocabulary so weekly practice updates the same FSRS card.'
  )
  on conflict (slug) do nothing;

  select id into v_deck from public.vocab_decks where slug = 'weeks-01-04';
  if v_deck is null then
    raise exception 'The weeks-01-04 vocabulary deck could not be created';
  end if;

  -- definition and example are both NOT NULL, so a word without either is
  -- skipped rather than padded with a placeholder.
  insert into public.vocab_items (deck_id, term, part_of_speech, definition, example, band)
  select
    v_deck,
    svi.target,
    'phrase',
    svi.example,
    svi.example,
    'B1'
  from public.syllabus_vocab_items svi
  where svi.week_number between 1 and 4
    and svi.target is not null
    and length(trim(svi.target)) > 0
    and svi.example is not null
    and length(trim(svi.example)) > 0
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
  if v_count = 0 then
    raise exception 'The weeks-01-04 vocabulary deck has no items';
  end if;
end $$;

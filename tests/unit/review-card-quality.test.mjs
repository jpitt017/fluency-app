import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { answersEquivalent, normalizeDiffWord } from '../../lib/b1b2/contractions.mjs';
import { findCollocationSpan } from '../../lib/b1b2/collocation-highlight.mjs';
import { evaluateAiCorrectionForCard } from '../../lib/b1b2/ai-review-card-filter.mjs';
import { markLearnerGrammarAnswer, nearlyRightGrammarFeedback } from '../../lib/curriculum/learner-grammar-marking.mjs';
import { markInputAnswer } from '../../lib/curriculum/input-marking.mjs';
import { createReviewEnricher } from '../../lib/curriculum/review-card-enrichment.mjs';
import {
  buildFullSentence,
  inputGapReviewCard,
  isAnswerablePrompt,
  isFullSentence,
  practiceErrorCard,
} from '../../lib/curriculum/week-practice-review.mjs';

const readJson = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const details = readJson('supabase-b1-b2/content/curriculum/weeks-01-04-details.json');
const vocabularyBank = readJson('supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json');
const vocabularyMeanings = readJson('lib/curriculum/vocabulary-meanings.json');
const inputReasons = readJson('lib/curriculum/input-reasons.json');
const vocabPractice = readJson('supabase-b1-b2/content/curriculum/vocab-review-practice-weeks-01-04.json');

const enricher = createReviewEnricher({
  details,
  vocabularyBank,
  vocabularyMeanings,
  inputReasons,
  vocabPractice,
});

const grammarItem = (id) =>
  details.weeks.flatMap((w) => w.grammar.practice.items).find((item) => item.id === id);

const inputQuestion = (id) =>
  [...details.listening.weeks, ...details.reading.weeks]
    .flatMap((w) => w.questions)
    .find((q) => q.id === id);

test('Part A: contraction equivalence accepts contracted and full forms without conflating ambiguous forms', () => {
  assert.equal(answersEquivalent("I've lived here for three years.", 'I have lived here for three years'), true);
  assert.equal(answersEquivalent("We're meeting at 3 p.m.", 'we are meeting at 3pm'), true);
  assert.equal(answersEquivalent("They'll arrive soon.", 'They will arrive soon.'), true);
  assert.equal(answersEquivalent("I won't go.", 'I will not go'), true);
  assert.equal(answersEquivalent("You can't park here.", 'You cannot park here.'), true);
  assert.equal(answersEquivalent("You can't park here.", 'You can not park here.'), true);
  assert.equal(answersEquivalent("You don't have to pay.", 'You do not have to pay'), true);
  assert.equal(answersEquivalent("You mustn't smoke.", 'You must not smoke.'), true);
  assert.equal(answersEquivalent("Let's leave early.", 'Let us leave early.'), true);
  // Ambiguous 'd matches had OR would, never conflating had with would.
  assert.equal(answersEquivalent("I'd travel more.", 'I would travel more.'), true);
  assert.equal(answersEquivalent("I'd never lived abroad.", 'I had never lived abroad.'), true);
  assert.equal(answersEquivalent('I had left early.', 'I would left early.'), false);
  // Ambiguous 's matches is OR has, never conflating is with has.
  assert.equal(answersEquivalent("She's an engineer.", 'She is an engineer.'), true);
  assert.equal(answersEquivalent("She's finished.", 'She has finished.'), true);
  assert.equal(answersEquivalent('She is finished.', 'She has finished.'), false);
  // Diff word normalisation ignores casing and outer punctuation.
  assert.equal(normalizeDiffWord("I'm"), normalizeDiffWord("i'm"));
  assert.equal(normalizeDiffWord('ago.'), normalizeDiffWord('ago'));
  assert.equal(normalizeDiffWord('p.m.'), normalizeDiffWord('pm'));
});

test('Part B: Weeks 1–4 accepted grammar answers and W3-V2 nearly-right guidance work everywhere', () => {
  const cases = [
    ['W1-G5', 'had not slept'],
    ['W1-G5', "hadn't slept"],
    ['W1-F3', 'I knew her for years before we worked together.'],
    ['W1-R1', 'I have been learning English since 2020.'],
    ['W1-R1', "I've been learning English since 2020."],
    ['W1-R2', 'The film had already started when we arrived.'],
    ['W1-R3', 'I saw an accident while I was walking home.'],
    ['W1-L1', 'lived'],
    ['W1-L2', 'used to take'],
    ['W1-L2', 'took'],
    ['W1-E3', 'has been working'],
    ['W2-C2', "'m going to have"],
    ['W2-C2', 'am going to have'],
    ['W2-C3', 'is leaving'],
    ['W2-G1', 'are moving'],
    ['W2-G1', 'are going to move'],
    ['W2-G1', "'re going to move"],
    ['W2-G2', 'will enjoy'],
    ['W2-G2', 'are going to enjoy'],
    ['W2-G4', 'am not coming'],
    ['W2-G4', 'am not going to come'],
    ['W2-G5', 'will help'],
    ['W2-R2', "As soon as I finish work, I'll phone you."],
    ['W2-R2', 'As soon as I finish work, I will phone you.'],
    ['W2-R3', "I'm meeting Ana at 3 p.m. on Thursday."],
    ['W2-R3', 'I am meeting Ana at 3pm on Thursday.'],
    ['W2-R3', "I'm meeting Ana on Thursday at 3 pm."],
    ['W2-L3', 'was'],
    ['W2-V1', "'ve been living"],
    ['W2-V1', 'have been living'],
    ['W2-E1', 'am seeing'],
    ['W2-E1', "'m going to see"],
    ['W2-E1', 'am going to see'],
    ['W2-E2', 'will be'],
    ['W2-E2', "'s going to be"],
    ['W2-E3', "'ve landed"],
    ['W2-E3', 'have landed'],
    ['W3-C1', 'must'],
    ['W3-C4', 'Can'],
    ['W3-C4', 'May'],
    ['W3-C5', 'was able to'],
    ['W3-C6', "can't"],
    ['W3-C6', 'cannot'],
    ['W3-C6', "aren't allowed to"],
    ['W3-C6', 'are not allowed to'],
    ['W3-G1', "'ll have to work"],
    ['W3-G1', 'will have to work'],
    ['W3-G3', 'cannot hear'],
    ['W3-F1', 'You have to show your ticket.'],
    ['W3-F3', 'Could I leave early today?'],
    ['W3-F3', 'May I leave early today?'],
    ['W3-R1', "We don't have to book a table."],
    ['W3-R1', 'We do not have to book a table.'],
    ['W3-R2', "We mustn't smoke here."],
    ['W3-R2', 'We must not smoke here.'],
    ['W3-R3', 'Could I sit here, please?'],
    ['W3-L3', 'However'],
    ['W3-V1', 'get'],
    ['W4-C6', 'is served'],
    ['W4-G4', 'is not included'],
    ['W4-R1', 'The castle was built in the twelfth century.'],
    ['W4-L1', 'in which'],
    ['W4-L2', 'that'],
  ];

  for (const [id, answer] of cases) {
    const item = grammarItem(id);
    assert.ok(item, `missing ${id}`);
    assert.equal(markLearnerGrammarAnswer(item, answer), true, `${id} should accept "${answer}"`);
  }

  // W3-V2: "was closed" is grammatically fine but does not practise past perfect.
  const w3v2 = grammarItem('W3-V2');
  assert.equal(markLearnerGrammarAnswer(w3v2, 'was closed'), false);
  assert.equal(
    nearlyRightGrammarFeedback(w3v2, 'was closed'),
    'Good English! Here, try the past perfect: had closed.',
  );
  const reviewCheck = enricher.checkReviewCardAnswer(
    { prompt_sentence: w3v2.prompt, corrected_sentence: 'By the time we got there, the shop had closed.' },
    'was closed',
  );
  assert.equal(reviewCheck.matched, true);
  assert.equal(reviewCheck.fixed, false);
  assert.equal(reviewCheck.nearly, true);
  assert.equal(reviewCheck.reason, 'Good English! Here, try the past perfect: had closed.');
});

test('Requirement 5: reading & listening gap items show word counts, accept variants, and give nearly-right guidance', () => {
  const expected = {
    'L1-X3': '(3 words)',
    'L2-X3': '(3 words)',
    'L3-X3': '(3 words)',
    'L4-X2': '(1 word)',
    'L4-X3': '(1 word)',
    'R4-X3': '(1 word)',
  };
  for (const [id, tag] of Object.entries(expected)) {
    const q = inputQuestion(id);
    assert.ok(q, `missing ${id}`);
    assert.ok(q.question.includes(tag), `${id} missing "${tag}": ${q.question}`);
    const mode = id.startsWith('L') ? 'listening' : 'reading';
    const week = details[mode].weeks.find((w) => w.questions.some((entry) => entry.id === id));
    const reasonEntry = inputReasons.items.find((entry) => entry.id === id);
    const card = inputGapReviewCard({
      userId: 'learner',
      question: q,
      sourceText: mode === 'listening' ? week.script : week.text,
      sourceLine: reasonEntry?.sourceLine ?? '',
      reason: reasonEntry?.reason ?? '',
    });
    assert.ok(card, `${id} should produce a valid Review card`);
    assert.ok(card.prompt_sentence.includes(tag), `${id} card prompt needs ${tag}`);
    assert.equal(isFullSentence(card.corrected_sentence), true, `${id} card needs full sentence`);
  }

  // L3-X3 accepts both UK "get on with" and US "get along with".
  const l3x3 = inputQuestion('L3-X3');
  assert.equal(markInputAnswer(l3x3, 'get on with').correct, true);
  assert.equal(markInputAnswer(l3x3, 'get along with').correct, true);

  // L4-X3 and R4-X3 give kind guidance for "more quiet".
  for (const id of ['L4-X3', 'R4-X3']) {
    const q = inputQuestion(id);
    assert.equal(markInputAnswer(q, 'quieter').correct, true);
    const nearly = markInputAnswer(q, 'more quiet');
    assert.equal(nearly.correct, false);
    assert.equal(nearly.nearly, true);
    assert.equal(nearly.reason, 'Right meaning, but we say quieter.');
  }
});

test('Requirements 1 & 2: error card enrichment upgrades legacy single-word cards and provides rule + practice without keys', () => {
  const legacyCard = {
    prompt_sentence: "She's ___ engineer.",
    corrected_sentence: 'an',
    explanation: 'Write the sentence again with this correction: an',
  };
  const enriched = enricher.enrichErrorReviewCard(legacyCard);
  assert.equal(enriched.kind, 'choice');
  assert.deepEqual(enriched.options, ['a', 'an']);
  assert.equal(enriched.displayCorrectedSentence, "She's an engineer.");
  assert.ok(enriched.rule && enriched.rule.reason.includes('vowel sound'));
  assert.ok(enriched.rule.examples.length >= 1);
  assert.ok(enriched.practiceItems.length >= 2);
  for (const p of enriched.practiceItems) {
    assert.equal('key' in p, false, 'practice items must never leak answer keys');
    assert.equal('accepted' in p, false, 'practice items must never leak accepted answers');
  }

  // Accepts bare option OR full sentence (and contraction equivalent).
  assert.equal(enricher.checkReviewCardAnswer(legacyCard, 'an').fixed, true);
  assert.equal(enricher.checkReviewCardAnswer(legacyCard, "She's an engineer.").fixed, true);
  assert.equal(enricher.checkReviewCardAnswer(legacyCard, 'She is an engineer.').fixed, true);
  const wrong = enricher.checkReviewCardAnswer(legacyCard, 'a');
  assert.equal(wrong.matched, true);
  assert.equal(wrong.fixed, false);
  assert.equal(wrong.expandedAttempt, "She's a engineer.");

  // Extra practice checker works deterministically.
  const firstPractice = enriched.practiceItems[0];
  const record = enricher.getRecordById(firstPractice.id);
  const okRes = enricher.checkReviewPracticeItem(firstPractice.id, Array.isArray(record.key) ? record.key.join(' ... ') : record.key);
  assert.equal(okRes.correct, true);
  assert.equal(isFullSentence(okRes.correctSentence), true);
});

test('Requirement 3: vocabulary cards highlight full collocations, show conditional Spanish, extra example, and practice', () => {
  // Highlighting handles inflected verbs, modifiers, and separated phrasal verbs.
  const s1 = 'I took a big risk when I moved to Bristol.';
  const span1 = findCollocationSpan(s1, 'take a risk');
  assert.equal(s1.slice(span1.start, span1.end), 'took a big risk');

  const s2 = 'We put the meeting off until Monday.';
  const span2 = findCollocationSpan(s2, 'put (something) off');
  assert.equal(s2.slice(span2.start, span2.end), 'put the meeting off');

  // Spanish mismatch included for "take a risk" (correr un riesgo), omitted for transparent cognate "ambition".
  const riskMeta = enricher.enrichVocabReviewCard({ term: 'take a risk', definition: 'old', translation_es: 'old' });
  assert.equal(riskMeta.collocation, 'take a risk');
  assert.ok(riskMeta.meaning.length > 5);
  assert.ok(riskMeta.es && riskMeta.es.includes('correr un riesgo'));
  assert.ok(riskMeta.extraExample && findCollocationSpan(riskMeta.extraExample, riskMeta.collocation));
  assert.ok(riskMeta.practiceItems.length >= 2);

  const ambitionMeta = enricher.enrichVocabReviewCard({ term: 'ambition', definition: 'old', translation_es: 'ambición' });
  assert.equal(ambitionMeta.es, null, 'transparent cognates omit Spanish');
  assert.ok(ambitionMeta.meaning.length > 5);
  assert.ok(ambitionMeta.extraExample);
  assert.ok(ambitionMeta.practiceItems.length >= 2);
});

test('Requirement 7: AI Review card filter rejects multi-point/style rewrites, extracts long-sentence clauses, and prompts preserve ideas', () => {
  // Clean 1-point grammar fix passes.
  const clean = evaluateAiCorrectionForCard({
    original: 'I have moved to Leeds in 2023.',
    corrected: 'I moved to Leeds in 2023.',
    category: 'tense',
  });
  assert.equal(clean.ok, true);
  assert.equal(clean.promptSentence, 'I have moved to Leeds in 2023.');
  assert.equal(clean.correctedSentence, 'I moved to Leeds in 2023.');

  // Multi-point rewrite is rejected for Review (stays in feedback only).
  const multi = evaluateAiCorrectionForCard({
    original: 'Yesterday I go to shop and buyed some breads for my family dinner.',
    corrected: 'Yesterday I went to the shop and bought some bread for my family dinner.',
    category: 'tense',
  });
  assert.equal(multi.ok, false);
  assert.equal(multi.reason, 'multi_point');

  // Coherence / organisation / style are rejected.
  for (const category of ['coherence', 'organisation', 'organization', 'style']) {
    const res = evaluateAiCorrectionForCard({
      original: 'First I went home.',
      corrected: 'First, I went home.',
      category,
    });
    assert.equal(res.ok, false);
  }

  // Long sentence (> 25 words) with a single error extracts just the erroneous clause + keeps full context.
  const longOrig = 'Last summer my sister and I travelled across northern Spain by train because we wanted to visit several historic towns, and we have stayed in a small hotel near the old square.';
  const longCorr = 'Last summer my sister and I travelled across northern Spain by train because we wanted to visit several historic towns, and we stayed in a small hotel near the old square.';
  const extracted = evaluateAiCorrectionForCard({
    original: longOrig,
    corrected: longCorr,
    category: 'tense',
  });
  assert.equal(extracted.ok, true);
  assert.ok(extracted.promptSentence.split(/\s+/).length <= 25);
  assert.equal(extracted.contextSentence, longOrig);

  // Requirement 7c: all AI feedback prompts include the idea-preservation rule.
  const requiredRule = "The corrected sentence must keep the learner's ideas. Don't add new information or phrases.";
  for (const file of [
    'lib/b1b2/feedback-schema.ts',
    'src/app/api/mediation/feedback/route.ts',
    'lib/b1b2/week-sentence-feedback.ts',
    'lib/b1b2/grammar-use-it-feedback.ts',
  ]) {
    const src = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.ok(src.includes(requiredRule), `${file} must include the idea-preservation rule`);
  }
});

test('Requirement 4: every non-Meaning weekly grammar item builds an answerable full-sentence card', () => {
  for (const week of details.weeks) {
    for (const item of week.grammar.practice.items) {
      if (item.step === 'Use it') continue;
      const card = practiceErrorCard({ userId: 'learner', item, answer: 'wrong', category: 'tense' });
      if (item.step === 'Meaning') {
        assert.equal(card, null, `${item.id} should not build a single-word Review card`);
      } else {
        assert.ok(card, `${item.id} should build a Review card`);
        assert.equal(isAnswerablePrompt(card.prompt_sentence, item.options), true, `${item.id} prompt not answerable`);
        assert.equal(isFullSentence(card.corrected_sentence), true, `${item.id} corrected not full sentence`);
      }
    }
  }
});

test('Teacher check: ruleExamples never repeat a same-week practice item prompt or key, and options/notes are accurate', () => {
  for (const week of details.weeks) {
    const itemSentences = [];
    for (const item of week.grammar.practice.items) {
      if (item.prompt?.trim()) itemSentences.push(item.prompt);
      if (/_{2,}/.test(item.prompt)) {
        const fullKey = buildFullSentence(item.prompt, item.key);
        if (fullKey) itemSentences.push(fullKey);
      } else if (typeof item.key === 'string' && item.key.trim()) {
        itemSentences.push(item.key);
      }
    }
    for (const [ruleName, examples] of Object.entries(week.grammar.ruleExamples)) {
      for (const example of examples) {
        for (const sentence of itemSentences) {
          assert.equal(
            answersEquivalent(example, sentence),
            false,
            `Week ${week.number} rule "${ruleName}" example "${example}" must not repeat "${sentence}"`,
          );
        }
      }
    }
  }

  // Spot-check Section A distractors do not contain secondary valid answers.
  const byId = new Map(vocabPractice.items.map((item) => [item.id, item]));
  assert.deepEqual(byId.get('VR-W1-make-a-big-decision-1').options, ['made', 'did', 'put']);
  assert.deepEqual(byId.get('VR-W1-take-a-risk-1').options, ['taking', 'making', 'doing']);
  assert.deepEqual(byId.get('VR-W2-intend-1').options, ['intend', 'pretend', 'catch']);
  assert.deepEqual(byId.get('VR-W3-arrange-1').options, ['arrange', 'repair', 'mend']);
});

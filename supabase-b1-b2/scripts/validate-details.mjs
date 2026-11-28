#!/usr/bin/env node
/** Validates the Weeks 1–4 detail specs and assessment specs. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildFullSentence,
  inputGapReviewCard,
  isAnswerablePrompt,
  isFullSentence,
  practiceErrorCard,
} from '../../lib/curriculum/week-practice-review.mjs';
import { markLearnerGrammarAnswer } from '../../lib/curriculum/learner-grammar-marking.mjs';
import { findCollocationSpan } from '../../lib/b1b2/collocation-highlight.mjs';
import { answersEquivalent } from '../../lib/b1b2/contractions.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const content = join(here, '..', 'content', 'curriculum');
const details = JSON.parse(readFileSync(join(content, 'weeks-01-04-details.json'), 'utf8'));
const assessments = JSON.parse(readFileSync(join(content, 'assessments.json'), 'utf8'));
const vocabularyBank = JSON.parse(readFileSync(join(content, 'vocabulary-exercises-weeks-01-04-v2.json'), 'utf8'));
const vocabPractice = JSON.parse(readFileSync(join(content, 'vocab-review-practice-weeks-01-04.json'), 'utf8'));
const inputReasons = JSON.parse(readFileSync(join(here, '..', '..', 'lib', 'curriculum', 'input-reasons.json'), 'utf8'));

const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};

const expectedCore = [8, 9, 9, 8];
const expectedCollocations = [6, 6, 5, 5];
const expectedCards = [14, 16, 15, 14];
const expectedLinkers = [2, 1, 3, 4];

check(String(details.status).includes('pilot draft'), 'detail specs must be marked as pilot draft');
check(String(assessments.status).includes('pilot draft'), 'assessment specs must be marked as pilot draft');
check(details.weeks?.length === 4, 'Weeks 1–4 details must contain exactly four weeks');

const allGrammarIds = new Set();
details.weeks?.forEach((week, index) => {
  const position = week.number;
  check(position === index + 1, `detail week ${position} is out of order`);
  check(Boolean(week.canDo?.trim()), `week ${position} needs a can-do statement`);
  check(Boolean(week.cefr?.canDo?.trim()), `week ${position} needs a CEFR can-do statement`);
  check(Boolean(week.cefr?.scale?.trim()), `week ${position} needs a CEFR scale`);
  check(Boolean(week.cefr?.level?.trim()), `week ${position} needs a CEFR level`);
  check(Boolean(week.grammar?.main?.trim()), `week ${position} needs main grammar notes`);
  check(Boolean(week.grammar?.light?.trim()), `week ${position} needs light grammar notes`);
  check(Boolean(week.writing?.words?.[0] === 120 && week.writing?.words?.[1] === 150), `week ${position} writing must be 120–150 words`);
  check(Boolean(week.conversation?.openingLine?.trim()), `week ${position} needs a conversation scenario`);
  check(week.vocabulary?.core?.length === expectedCore[index], `week ${position} core count is wrong`);
  check(week.vocabulary?.collocations?.length === expectedCollocations[index], `week ${position} collocation count is wrong`);
  check(week.vocabulary?.newCards === expectedCards[index], `week ${position} card count is wrong`);
  check(week.linkers?.length === expectedLinkers[index], `week ${position} linker count is wrong`);
  check(week.checkpoint1?.mainItems === 4 && week.checkpoint1?.lightItems === 1, `week ${position} checkpoint blueprint is wrong`);

  const practice = week.grammar?.practice;
  check(practice?.steps?.length === 9, `week ${position} needs the nine-step grammar task`);
  check(Boolean(practice?.notice?.text?.trim()), `week ${position} needs the notice text`);
  check(practice?.items?.length === 30, `week ${position} needs 30 grammar practice items`);
  practice?.items?.forEach((item) => {
    check(!allGrammarIds.has(item.id), `duplicate grammar item ID ${item.id}`);
    allGrammarIds.add(item.id);
    check(Boolean(item.prompt?.trim()), `${item.id} needs a prompt`);
    check(Boolean(item.reason?.trim()), `${item.id} needs a reason`);
    check(item.key?.length > 0, `${item.id} needs a key`);
    check(Array.isArray(item.accepted), `${item.id} needs a separate accepted-answers list`);
    if (item.step === 'Choose') check(item.options?.length === 2, `${item.id} needs two options`);
    if (Array.isArray(item.key)) {
      check(item.accepted.length === item.key.length, `${item.id} needs one accepted list per gap`);
      item.accepted.forEach((list) => check(Array.isArray(list), `${item.id} accepted variants must be lists per gap`));
    } else {
      check(item.accepted.every((variant) => typeof variant === 'string'), `${item.id} accepted variants must be strings`);
    }
  });

  const speaking = week.speaking;
  check(Boolean(speaking?.prompt?.trim()), `week ${position} needs a speaking prompt`);
  check(Boolean(speaking?.cueCard?.trim()), `week ${position} needs a cue card`);
  check(speaking?.phraseBank?.length >= 5, `week ${position} needs a phrase bank`);
  check(Boolean(speaking?.model?.trim()), `week ${position} needs a speaking model`);
  check(Boolean(speaking?.onTarget?.trim()), `week ${position} needs on-target criteria`);
  check(Boolean(speaking?.correctionPriority?.trim()), `week ${position} needs correction priorities`);
  check(speaking?.shadowingChunks?.length === 3, `week ${position} needs three shadowing chunks`);
  check(speaking?.conversation?.turns?.length === 4, `week ${position} needs a four-turn conversation`);
  check(Boolean(speaking?.conversation?.closingLine?.trim()), `week ${position} needs a conversation closing line`);
  check(Boolean(speaking?.delayedRecall?.trim()), `week ${position} needs a delayed-recall prompt`);
  check(Boolean(speaking?.b2Stretch?.trim()), `week ${position} needs a B2 stretch`);
});
check(allGrammarIds.size === 120, 'the item bank must contain 120 unique items');

const week1Item = details.weeks?.[0]?.grammar?.practice?.items?.find((item) => item.id === 'W1-L3');
check(week1Item?.options?.join('/') === "'ve been studying/study", "W1-L3 must offer 've been studying / study'");
check(week1Item?.key === "'ve been studying", "W1-L3 key must be 've been studying'");
const week1Gap = details.weeks?.[0]?.grammar?.practice?.items?.find((item) => item.id === 'W1-C5');
check(JSON.stringify(week1Gap?.key) === '["Have","lived"]', 'W1-C5 needs one key per gap');
const week4Gap = details.weeks?.[3]?.grammar?.practice?.items?.find((item) => item.id === 'W4-G5');
check(JSON.stringify(week4Gap?.key) === '["was","made"]', 'W4-G5 needs one key per gap');
check(
  details.weeks?.[2]?.speaking?.prompt?.includes('A new flatmate arrives tomorrow. Record a welcome'),
  'Week 3 speaking must be the recorded flatmate welcome',
);
check(
  details.weeks?.[2]?.speaking?.conversation?.title === "a new flatmate's first evening",
  'Week 3 back-and-forth must live in the conversation task',
);

check(String(details.writing?.status).includes('pilot draft'), 'writing content must be marked as pilot draft');
check(details.writing?.steps?.length === 5, 'writing task needs five steps');
check(details.writing?.reviewChecklist?.length === 7, 'writing review checklist needs seven items');
check(
  details.writing?.reviewChecklist?.some((item) => item.includes('Edinburgh Castle on an extinct volcano') && item.includes("St Margaret's Chapel")),
  'the writing review checklist must carry the revised Week 4 Edinburgh fact-check',
);
check(details.writing?.weeks?.length === 4, 'writing content needs four weeks');
details.weeks?.forEach((week, index) => {
  const writing = week.writing;
  check(String(writing?.status).includes('pilot draft'), `week ${index + 1} writing must be marked as pilot draft`);
  check(Boolean(writing?.prompt?.trim()), `week ${index + 1} needs a writing prompt`);
  check(writing?.words?.[0] === 120 && writing?.words?.[1] === 150, `week ${index + 1} writing must be 120–150 words`);
  check(writing?.requiredPoints?.length === [5, 6, 5, 5][index], `week ${index + 1} needs the revised number of required points`);
  check(writing?.planFrame?.length === 4, `week ${index + 1} needs a four-step plan frame`);
  check(writing?.usefulLanguage?.length >= 5, `week ${index + 1} needs useful language`);
  check(Boolean(writing?.readerAndPurpose?.trim()), `week ${index + 1} needs a reader and purpose`);
  check(Boolean(writing?.onTarget?.trim()), `week ${index + 1} needs on-target criteria`);
  check(Boolean(writing?.correctionPriority?.trim()), `week ${index + 1} needs correction priorities`);
  check(Boolean(writing?.reviseAndRetryFocus?.trim()), `week ${index + 1} needs a revise-and-retry focus`);
  check(Boolean(writing?.modelAnswer?.trim()), `week ${index + 1} needs a model answer`);
  check(Boolean(writing?.delayedRecall?.trim()), `week ${index + 1} needs a delayed-recall prompt`);
  check(Boolean(writing?.pairedReading?.trim()), `week ${index + 1} needs its paired reading`);
});
check(details.writing?.source?.includes('revised so each task matches the repo reading texts'), 'writing source must record the revision');
check(details.weeks?.[1]?.writing?.prompt?.includes('Ask Sam advice column'), 'Week 2 writing must be the Ask Sam letter');
check(details.weeks?.[1]?.writing?.requiredPoints?.some((point) => point.includes('question asking for advice')), 'Week 2 must require an advice question');
check(details.weeks?.[3]?.writing?.modelAnswer?.includes('Edinburgh'), 'Week 4 model answer must use the revised Edinburgh trip');

details.weeks?.forEach((week) => {
  check(!week.writing?.modelAnswer?.includes('Bath'), `Week ${week.number} writing model must not mention Bath`);
});

check(Boolean(assessments.checkpoint1?.writing?.onTarget?.trim()), 'checkpoint writing needs an on-target rule');

const inputIds = new Set();
for (const mode of ['listening', 'reading']) {
  const spec = details[mode];
  check(String(spec?.status).includes('pilot draft'), `${mode} content must be marked as pilot draft`);
  check(spec?.weeks?.length === 4, `${mode} needs four weeks`);
  check(spec?.steps?.length === 6, `${mode} needs six task steps`);
  check(Boolean(spec?.unlocking?.trim()), `${mode} needs an unlocking rule`);
  check(spec?.extensive?.stock?.length === 4, `${mode} needs an extensive-input stock brief`);
  check(spec?.extensive?.stock?.every((row) => row.week >= 1 && row.week <= 4), `${mode} stock brief needs all four weeks`);
  spec?.weeks?.forEach((content, index) => {
    const week = index + 1;
    check(content.week === week, `${mode} week ${week} is out of order`);
    check(Boolean(content.title?.trim()), `${mode} week ${week} needs a title`);
    check(Boolean(content.predict?.trim()), `${mode} week ${week} needs a prediction prompt`);
    check(Boolean((mode === 'listening' ? content.script : content.text)?.trim()), `${mode} week ${week} needs the full script/text`);
    check(Boolean(content.respond?.trim()), `${mode} week ${week} needs a response prompt`);
    check(content.questions?.length === 10, `${mode} week ${week} needs 10 questions`);
    const steps = content.questions?.reduce((counts, question) => ({ ...counts, [question.step]: (counts[question.step] ?? 0) + 1 }), {}) ?? {};
    check(steps.Gist === 1, `${mode} week ${week} needs one gist question`);
    check(steps.Detail === 6, `${mode} week ${week} needs six detail questions`);
    check(steps.Language === 3, `${mode} week ${week} needs three language questions`);
    content.questions?.forEach((question) => {
      check(!inputIds.has(question.id), `duplicate ${mode} question ID ${question.id}`);
      inputIds.add(question.id);
      check(question.id.startsWith(mode === 'listening' ? 'L' : 'R'), `${question.id} has the wrong ID prefix`);
      check(Boolean(question.question?.trim()) && Boolean(question.key?.trim()), `${question.id} needs a question and key`);
    });
  });
}
check(inputIds.size === 80, 'listening and reading must contain 80 unique questions');

const grammarSteps = details.pilotRules?.grammarTask?.steps ?? [];
check(grammarSteps.length === 9, 'grammar task must have a nine-step structure');
check(grammarSteps.reduce((sum, step) => sum + step.minutes, 0) === 20, 'grammar task steps must total 20 minutes');
check(grammarSteps.reduce((sum, step) => sum + (step.items ?? 0), 0) === 25, 'grammar task steps must total 25 auto-marked items');

const progression = String(details.pilotRules?.progression ?? '');
for (const phrase of ['speaking', 'writing', 'either listening or reading']) {
  check(progression.includes(phrase), `progression rule must mention ${phrase}`);
}
const checkpointConditions = JSON.stringify(assessments.checkpoint1?.writing?.conditions ?? []);
for (const phrase of ['30 minutes', 'pasting disabled', 'One submission']) {
  check(checkpointConditions.includes(phrase), `checkpoint writing conditions must include ${phrase}`);
}

for (const set of [assessments.writingDescriptors, assessments.speakingDescriptors]) {
  check(set?.criteria?.length === 4, 'descriptor sets need four criteria');
  set?.criteria?.forEach((criterion) => {
    for (const band of ['gettingThere', 'onTarget', 'beyondTarget']) {
      check(Boolean(criterion[band]?.trim()), `${criterion.key} needs a ${band} descriptor`);
    }
  });
}
check(
  assessments.speakingDescriptors?.criteria?.some((criterion) => criterion.key === 'coherence'),
  'speaking descriptors need the coherence criterion',
);
check(assessments.writingDescriptors?.wordRanges?.length === 5, 'writing descriptors need five word-range rows');

const questionTotal = assessments.placement?.questionBlueprint?.reduce((sum, row) => sum + row.questions, 0) ?? 0;
check(questionTotal === 24, 'placement blueprint must total 24 questions');
check(assessments.placement?.decisionRules?.length === 3, 'placement needs three decision outcomes');

const cp = assessments.checkpoint1;
check(!('speakingTask' in cp), 'checkpoint speakingTask must be replaced by the full speaking spec');
check(Boolean(cp?.speaking?.prompt?.trim()), 'checkpoint speaking needs its prompt');
check(cp?.speaking?.conditions?.length === 6, 'checkpoint speaking needs six conditions');
const allItems = [...(cp?.items ?? []), ...(cp?.reserves ?? [])];
check(cp?.items?.length === 20, 'Checkpoint 1 needs 20 scored items');
check(cp?.reserves?.length === 4, 'Checkpoint 1 needs 4 reserves');
check(new Set(allItems.map((item) => item.id)).size === allItems.length, 'checkpoint item IDs must be unique');
for (let week = 1; week <= 4; week += 1) {
  check(cp.items.filter((item) => item.week === week).length === 5, `week ${week} needs five scored checkpoint items`);
  check(cp.reserves.some((item) => item.week === week), `week ${week} needs a reserve item`);
}
allItems.forEach((item) => {
  check(Boolean(item.prompt?.trim()) && Boolean(item.key?.trim()) && Boolean(item.reason?.trim()), `${item.id} needs prompt, key and reason`);
});

// Requirement 4d: every weekly practice Review card must be answerable with a
// full corrected sentence and authored rule explanation (never fragments or single words).
for (const week of details.weeks ?? []) {
  const ruleExamples = week.grammar?.ruleExamples ?? {};
  for (const item of week.grammar?.practice?.items ?? []) {
    if (item.step === 'Use it') continue;
    if (item.step === 'Meaning') {
      const card = practiceErrorCard({ userId: 'validator', item, answer: 'wrong', category: 'tense' });
      check(card === null, `${item.id} (Meaning) must not create a single-word Review card`);
      continue;
    }
    check(Boolean(item.rule && Array.isArray(ruleExamples[item.rule]) && ruleExamples[item.rule].length >= 1),
      `${item.id} needs a grammar rule tag with 1–2 ruleExamples`);
    const card = practiceErrorCard({ userId: 'validator', item, answer: 'wrong', category: 'tense' });
    check(card !== null, `${item.id} must build a valid Review card`);
    if (card) {
      check(isAnswerablePrompt(card.prompt_sentence, item.options), `${item.id} Review card prompt is not answerable: ${card.prompt_sentence}`);
      check(isFullSentence(card.corrected_sentence), `${item.id} Review card corrected_sentence is not a full sentence: ${card.corrected_sentence}`);
      check(Boolean(card.explanation?.trim()) && !/^Write the (?:sentence|answer) again/i.test(card.explanation),
        `${item.id} Review card needs an authored rule explanation`);
    }
    // Requirement 6d: every declared accepted answer must mark as correct.
    if (Array.isArray(item.key)) {
      check(markLearnerGrammarAnswer(item, item.key), `${item.id} key failed markLearnerGrammarAnswer`);
      for (const gapList of item.accepted ?? []) {
        for (const variant of gapList ?? []) {
          check(typeof variant === 'string' && Boolean(variant.trim()), `${item.id} has empty accepted gap variant`);
        }
      }
    } else {
      check(markLearnerGrammarAnswer(item, item.key), `${item.id} key failed markLearnerGrammarAnswer`);
      for (const variant of item.accepted ?? []) {
        check(Boolean(variant.trim()), `${item.id} has empty accepted variant`);
        check(markLearnerGrammarAnswer(item, variant), `${item.id} accepted variant "${variant}" failed markLearnerGrammarAnswer`);
      }
    }
  }

  // Teacher-check Section E: a rule example must not equal any practice item's
  // prompt or key (or accepted) sentence in the same week.
  const weekItemSentences = [];
  for (const item of week.grammar?.practice?.items ?? []) {
    if (item.prompt?.trim()) {
      weekItemSentences.push({ id: item.id, kind: 'prompt', text: item.prompt });
    }
    if (typeof item.prompt === 'string' && /_{2,}/.test(item.prompt)) {
      const fullKey = buildFullSentence(item.prompt, item.key);
      if (fullKey) weekItemSentences.push({ id: item.id, kind: 'key', text: fullKey });
    } else if (typeof item.key === 'string' && item.key.trim()) {
      weekItemSentences.push({ id: item.id, kind: 'key', text: item.key });
    }
    if (!Array.isArray(item.key)) {
      for (const variant of item.accepted ?? []) {
        if (typeof variant === 'string' && variant.trim()) {
          const fullVariant = typeof item.prompt === 'string' && /_{2,}/.test(item.prompt)
            ? buildFullSentence(item.prompt, variant)
            : variant;
          if (fullVariant) weekItemSentences.push({ id: item.id, kind: 'accepted', text: fullVariant });
        }
      }
    }
  }
  for (const [ruleName, examples] of Object.entries(ruleExamples)) {
    for (const example of examples ?? []) {
      for (const sentence of weekItemSentences) {
        check(
          !answersEquivalent(example, sentence.text),
          `week ${week.number} ruleExample for "${ruleName}" ("${example}") equals ${sentence.id} ${sentence.kind} ("${sentence.text}")`,
        );
      }
    }
  }

  // Requirement 3: vocab entries need extraExample & highlightable collocation span.
  for (const group of ['core', 'collocations', 'optional']) {
    for (const entry of week.vocabulary?.[group] ?? []) {
      check(Boolean(entry.extraExample?.trim()) && isFullSentence(entry.extraExample),
        `week ${week.number} vocab "${entry.target}" needs a full-sentence extraExample`);
      const target = entry.collocation ?? entry.target;
      check(Boolean(findCollocationSpan(entry.example, target)),
        `week ${week.number} vocab "${entry.target}" example does not highlight "${target}": ${entry.example}`);
      check(Boolean(findCollocationSpan(entry.extraExample, target)),
        `week ${week.number} vocab "${entry.target}" extraExample does not highlight "${target}": ${entry.extraExample}`);
    }
  }
}

for (const week of vocabularyBank.weeks ?? []) {
  for (const item of [...(week.chooseVerb ?? []), ...(week.wordForms ?? [])]) {
    const key = item.options?.[item.answer_index];
    const card = practiceErrorCard({
      userId: 'validator',
      item: { prompt: item.question, key, options: item.options, reason: item.reason },
      answer: 'wrong',
      category: 'collocation',
    });
    check(card !== null, `${item.id} must build a valid Review card`);
    if (card) {
      check(isAnswerablePrompt(card.prompt_sentence, item.options), `${item.id} Review card prompt is not answerable`);
      check(isFullSentence(card.corrected_sentence), `${item.id} Review card corrected_sentence is not a full sentence`);
      check(Boolean(card.explanation?.trim()), `${item.id} Review card needs an explanation`);
    }
  }
}

// Requirement 3e: every Weeks 1–4 vocab entry has at least 2 deterministic extra practice items.
const practiceCountByTerm = new Map();
for (const item of vocabPractice.items ?? []) {
  const key = item.term.trim().toLowerCase();
  practiceCountByTerm.set(key, (practiceCountByTerm.get(key) ?? 0) + 1);
  check(Boolean(item.prompt?.includes('___')), `${item.id} vocab practice item needs a gap`);
  check(Boolean(item.key?.trim()) && Boolean(item.reason?.trim()), `${item.id} vocab practice item needs key and reason`);
}
for (const week of details.weeks ?? []) {
  for (const group of ['core', 'collocations', 'optional']) {
    for (const entry of week.vocabulary?.[group] ?? []) {
      const count = practiceCountByTerm.get(entry.target.trim().toLowerCase()) ?? 0;
      check(count >= 2, `week ${week.number} vocab "${entry.target}" needs at least 2 extra practice items (found ${count})`);
    }
  }
}

// Requirement 5d: every reading & listening gap item specifies its exact word count
// and builds a valid full-sentence Review card.
const inputReasonById = new Map((inputReasons.items ?? []).map((entry) => [entry.id, entry]));
for (const mode of ['listening', 'reading']) {
  for (const week of details[mode]?.weeks ?? []) {
    const sourceText = mode === 'listening' ? week.script : week.text;
    for (const question of week.questions ?? []) {
      if (!/_{2,}/.test(question.question)) continue;
      const expectedWords = question.key.trim().split(/\s+/).filter(Boolean).length;
      const expectedLabel = `(${expectedWords} ${expectedWords === 1 ? 'word' : 'words'})`;
      check(
        question.question.includes(expectedLabel),
        `${question.id} gap question must include word count "${expectedLabel}": ${question.question}`,
      );
      const reasonEntry = inputReasonById.get(question.id);
      const card = inputGapReviewCard({
        userId: 'validator',
        question,
        sourceText,
        sourceLine: reasonEntry?.sourceLine ?? '',
        reason: reasonEntry?.reason ?? '',
      });
      check(card !== null, `${question.id} must build a valid full-sentence Review card`);
      if (card) {
        check(card.prompt_sentence.includes(expectedLabel), `${question.id} Review card prompt must include "${expectedLabel}"`);
        check(isFullSentence(card.corrected_sentence), `${question.id} Review card corrected_sentence must be a full sentence`);
      }
    }
  }
}

if (errors.length) {
  console.error(`Detail validation failed (${errors.length} problems):`);
  errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}

console.log(
  `Details OK: 4 weeks (${expectedCards.reduce((a, b) => a + b, 0)} cards), 120 grammar items, 80 input questions, 4 full writing tasks, 4 writing + 4 speaking criteria, 24 placement questions, ${cp.items.length} checkpoint items + ${cp.reserves.length} reserves.`,
);

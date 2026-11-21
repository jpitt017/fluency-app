#!/usr/bin/env node
/** Validates the Weeks 1–4 detail specs and assessment specs. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const content = join(here, '..', 'content', 'curriculum');
const details = JSON.parse(readFileSync(join(content, 'weeks-01-04-details.json'), 'utf8'));
const assessments = JSON.parse(readFileSync(join(content, 'assessments.json'), 'utf8'));

const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};

const expectedCore = [8, 9, 9, 8];
const expectedCollocations = [6, 6, 5, 5];
const expectedCards = [14, 16, 15, 14];
const expectedLinkers = [2, 1, 3, 4];

check(details.weeks?.length === 4, 'Weeks 1–4 details must contain exactly four weeks');
details.weeks?.forEach((week, index) => {
  const position = index + 1;
  check(week.number === position, `detail week ${week.number} is out of order`);
  check(Boolean(week.canDo?.trim()), `week ${position} needs a can-do statement`);
  check(Boolean(week.grammar?.main?.trim()), `week ${position} needs main grammar notes`);
  check(Boolean(week.grammar?.light?.trim()), `week ${position} needs light grammar notes`);
  check(week.grammar?.sampleItems?.length >= 2, `week ${position} needs sample grammar items`);
  check(Boolean(week.speaking?.model?.trim()), `week ${position} needs a speaking model`);
  check(week.writing?.words?.[0] === 120 && week.writing?.words?.[1] === 150, `week ${position} writing must be 120–150 words`);
  check(Boolean(week.conversation?.openingLine?.trim()), `week ${position} needs a conversation scenario`);
  check(week.vocabulary?.core?.length === expectedCore[index], `week ${position} core count is wrong`);
  check(week.vocabulary?.collocations?.length === expectedCollocations[index], `week ${position} collocation count is wrong`);
  check(week.vocabulary?.newCards === expectedCards[index], `week ${position} card count is wrong`);
  check(week.linkers?.length === expectedLinkers[index], `week ${position} linker count is wrong`);
  check(week.checkpoint1?.mainItems === 4 && week.checkpoint1?.lightItems === 1, `week ${position} checkpoint blueprint is wrong`);
});

const grammarSteps = details.pilotRules?.grammarTask?.steps ?? [];
check(grammarSteps.length === 9, 'grammar task must have a nine-step structure');
check(
  grammarSteps.reduce((sum, step) => sum + step.minutes, 0) === 20,
  'grammar task steps must total 20 minutes',
);
check(
  grammarSteps.reduce((sum, step) => sum + (step.items ?? 0), 0) === 25,
  'grammar task steps must total 25 auto-marked items',
);
const week1Item = details.weeks?.[0]?.grammar?.sampleItems?.find((item) => item.prompt.startsWith("I'm tired because"));
check(week1Item?.options?.join('/') === "'ve been studying/study", "Week 1 'I'm tired' item must offer 've been studying / study'");
check(
  details.weeks?.[2]?.speaking?.prompt?.includes('flatmate back-and-forth is the conversation task'),
  'Week 3 recording must be distinguished from the flatmate conversation',
);

const progression = String(details.pilotRules?.progression ?? '');
for (const phrase of ['speaking', 'writing', 'either listening or reading']) {
  check(progression.includes(phrase), `progression rule must mention ${phrase}`);
}
const checkpointConditions = JSON.stringify(assessments.checkpoint1?.writing?.conditions ?? []);
for (const phrase of ['30 minutes', 'pasting disabled', 'One submission']) {
  check(checkpointConditions.includes(phrase), `checkpoint writing conditions must include ${phrase}`);
}

const wd = assessments.writingDescriptors;
check(wd?.criteria?.length === 4, 'writing descriptors need four criteria');
check(wd?.wordRanges?.length === 5, 'writing descriptors need five word-range rows');
wd?.criteria?.forEach((criterion) => {
  for (const band of ['gettingThere', 'onTarget', 'beyondTarget']) {
    check(Boolean(criterion[band]?.trim()), `${criterion.key} needs a ${band} descriptor`);
  }
});

const questionTotal = assessments.placement?.questionBlueprint?.reduce((sum, row) => sum + row.questions, 0) ?? 0;
check(questionTotal === 24, 'placement blueprint must total 24 questions');
check(assessments.placement?.decisionRules?.length === 3, 'placement needs three decision outcomes');

const cp = assessments.checkpoint1;
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

if (errors.length) {
  console.error(`Detail validation failed (${errors.length} problems):`);
  errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}

console.log(
  `Details OK: 4 weeks (${expectedCards.reduce((a, b) => a + b, 0)} cards), 4 writing criteria, 24 placement questions, ${cp.items.length} checkpoint items + ${cp.reserves.length} reserves.`,
);

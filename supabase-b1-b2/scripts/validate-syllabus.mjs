#!/usr/bin/env node
/**
 * Validates the two-stage syllabus JSON before it is seeded into Supabase or
 * consumed by the app. Run with: npm run validate:syllabus
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '..', 'content', 'curriculum', 'two-stage-syllabus.json');
const doc = JSON.parse(readFileSync(file, 'utf8'));

const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};

check(doc.course?.totalWeeks === 32, 'course.totalWeeks must be 32');
check(doc.course?.totalHours === 104, 'course.totalHours must be 104');
check(doc.stages?.length === 2, 'there must be exactly two stages');
check(doc.weeks?.length === 32, 'there must be exactly 32 weeks');
check(doc.checkpoints?.length === 8, 'there must be exactly 8 checkpoints');
check(doc.skillLadders?.length === 6, 'there must be six skill ladders');
check(doc.weeklyTasks?.length === 9, 'there must be nine weekly task rows');

for (const [index, stage] of (doc.stages ?? []).entries()) {
  const expectedStart = index === 0 ? 1 : 17;
  check(stage.number === index + 1, `stage ${stage.number} is out of order`);
  check(stage.weekStart === expectedStart, `stage ${stage.number} must start at week ${expectedStart}`);
  check(stage.weekEnd === expectedStart + 15, `stage ${stage.number} must end at week ${expectedStart + 15}`);
  check(stage.hours === 52, `stage ${stage.number} must be 52 hours`);
  check(stage.phases?.length === 4, `stage ${stage.number} must have four phases`);
  check(stage.checkpoints?.length === 4, `stage ${stage.number} must have four checkpoints`);
}

const seenWeeks = new Set();
for (const week of doc.weeks ?? []) {
  check(!seenWeeks.has(week.number), `duplicate week ${week.number}`);
  seenWeeks.add(week.number);
  const stage = (doc.stages ?? []).find((item) => item.number === week.stage);
  check(Boolean(stage), `week ${week.number} has no valid stage`);
  if (stage) {
    check(week.number >= stage.weekStart && week.number <= stage.weekEnd, `week ${week.number} is outside its stage`);
    check(stage.phases.some((phase) => phase.weeks === week.phase), `week ${week.number} has an unknown phase`);
    check(stage.checkpoints.includes(week.number) === (week.number % 4 === 0), `week ${week.number} checkpoint mapping is wrong`);
  }
  check(Boolean(week.theme?.trim()), `week ${week.number} needs a theme`);
  check(Boolean(week.mainGrammar?.trim()), `week ${week.number} needs a main grammar point`);
  check(Boolean(week.secondaryGrammarLabel?.trim()), `week ${week.number} needs a secondary grammar label or null usage`);
}

for (const weekNumber of Array.from({ length: 32 }, (_, i) => i + 1)) {
  check(seenWeeks.has(weekNumber), `week ${weekNumber} is missing`);
}

const seenCheckpoints = new Set();
for (const cp of doc.checkpoints ?? []) {
  check(!seenCheckpoints.has(cp.afterWeek), `duplicate checkpoint after week ${cp.afterWeek}`);
  seenCheckpoints.add(cp.afterWeek);
  check(cp.afterWeek % 4 === 0, `checkpoint ${cp.number} must follow a multiple-of-four week`);
  check(Boolean(cp.assessed?.trim()), `checkpoint ${cp.number} needs an assessment description`);
  const stage = (doc.stages ?? []).find((item) => item.number === cp.stage);
  check(stage?.checkpoints.includes(cp.afterWeek) ?? false, `checkpoint ${cp.number} is not mapped to its stage`);
}

for (const ladder of doc.skillLadders ?? []) {
  check(ladder.levels?.length === 6, `ladder ${ladder.key} must cover six phases`);
  for (const level of ladder.levels ?? []) {
    check(/^\d+-\d+$/.test(level.weeks), `ladder ${ladder.key} has an invalid week range: ${level.weeks}`);
    check(Boolean(level.value?.trim()), `ladder ${ladder.key} (${level.weeks}) needs a value`);
  }
}

for (const task of doc.weeklyTasks ?? []) {
  check(Boolean(task.title?.trim()), `task ${task.key} needs a title`);
  check(['optional', 'either', 'required', 'recommended'].includes(task.requirementKind), `task ${task.key} has an invalid requirement kind`);
}

if (errors.length) {
  console.error(`Syllabus validation failed (${errors.length} problems):`);
  errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}

console.log(
  `Syllabus OK: ${doc.stages.length} stages, ${doc.weeks.length} weeks, ${doc.checkpoints.length} checkpoints, ${doc.skillLadders.length} skill ladders, ${doc.weeklyTasks.length} weekly tasks.`,
);

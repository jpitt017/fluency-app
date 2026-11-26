import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MINI_PLAYER_WRAPPER_CLASS,
  READING_TEXT_BUTTON_CLASS,
  formatClock,
  glossCheckScore,
  inputSummary,
  isShortOptionSet,
  questionPositionLabel,
  readingTextPanelClass,
  wordPositionLabel,
} from '../../lib/curriculum/week-input-ui.mjs';
import { projectReadingSupport } from '../../lib/curriculum/reading-support.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const details = JSON.parse(read('supabase-b1-b2/content/curriculum/weeks-01-04-details.json'));
const readingContent = JSON.parse(read('supabase-b1-b2/content/curriculum/reading-support-weeks-01-04.json'));

test('positions, scores and the clock read exactly as the brief asks', () => {
  assert.equal(questionPositionLabel(2, 10), 'Question 3 of 10');
  assert.equal(wordPositionLabel(1, 4), 'Word 2 of 4');
  assert.equal(inputSummary(10, 8, 10), 'You answered 10 of 10. 8 were right.');
  assert.equal(inputSummary(10, 1, 10), 'You answered 10 of 10. 1 was right.');
  assert.equal(glossCheckScore(3, 4), 'You got 3 of 4 right.');
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(95.7), '1:35');
  assert.equal(formatClock(Number.NaN), '0:00');
});

test('only True/False and Yes/No count as short option sets', () => {
  for (const options of [['True', 'False'], ['False', 'True'], ['yes', 'NO'], [' Yes ', 'No ']]) {
    assert.equal(isShortOptionSet(options), true, JSON.stringify(options));
  }
  for (const options of [[], ['True'], ['True', 'False', 'Maybe'], ['before', 'after'], ['not allowed', 'not necessary'], [null, 'True']]) {
    assert.equal(isShortOptionSet(options), false, JSON.stringify(options));
  }
  // Both sets really occur in the authored Weeks 1–4 bank.
  const options = [...details.reading.weeks, ...details.listening.weeks].flatMap((week) => week.questions.map((q) => q.options));
  assert.ok(options.some((set) => isShortOptionSet(set)));
});

test('the reading predict line is gone from the learner page but stays in the teacher JSON', () => {
  const before = read('components/b1b2/ReadingSupport.tsx');
  const projection = read('lib/curriculum/reading-support.mjs');
  const loader = read('lib/curriculum/learner-week.ts');
  const page = read('src/app/week/[n]/page.tsx');
  const teacher = read('components/curriculum/InputSpec.tsx');
  assert.doesNotMatch(before, /support\.predict/, 'no predict line before the reading questions');
  assert.doesNotMatch(before, /\{support\.predict\}|First line:/, 'no old predict copy rendered');
  assert.doesNotMatch(projection, /predict\s*[:,=]/, 'the learner projection has no predict field at all');
  assert.doesNotMatch(loader, /reading\.predict/, 'the loader no longer passes the authored predict');
  assert.match(before, /support\.context/, 'the context line stays');
  assert.match(before, /Two words to know/, 'the two key words stay');
  assert.match(page, /ReadingPracticeLayout/);
  // Teachers keep the authored prompt: JSON, validator and teacher page.
  for (const week of details.reading.weeks) assert.ok(week.predict.startsWith('Title:'), `week ${week.week} keeps its predict`);
  assert.match(read('supabase-b1-b2/scripts/validate-details.mjs'), /needs a prediction prompt/);
  assert.match(teacher, /content\.predict/);
});

test('no week can project the predict line, even if a caller passes one', () => {
  for (const week of details.reading.weeks) {
    const projected = projectReadingSupport(readingContent, week.week, {
      text: week.text,
      predict: week.predict,
    });
    assert.equal(Object.hasOwn(projected, 'predict'), false, `week ${week.week}`);
    assert.equal(JSON.stringify(projected).includes(week.predict), false, `week ${week.week} text leaked`);
    assert.equal(projected.context.length > 0, true, `week ${week.week} keeps its context`);
    assert.equal(projected.keyWords.length, 2, `week ${week.week} keeps its two key words`);
  }
});

test('listening keeps the structured intro and never renders the old predict line', () => {
  const intro = read('components/b1b2/ListeningSupport.tsx');
  const loader = read('lib/curriculum/learner-week.ts');
  assert.match(intro, /support\.intro\.predict/, 'the new structured intro stays');
  assert.doesNotMatch(loader, /listening\.predict/, 'the old Title/Caption line is not projected');
  for (const week of details.listening.weeks) assert.ok(week.predict.startsWith('Title:'), 'teacher JSON keeps the old line');
});

test('reading and listening questions are one at a time, with a jumpable progress bar', () => {
  const task = read('components/b1b2/WeekInputTask.tsx');
  const pager = read('components/b1b2/PracticeItemPager.tsx');
  assert.match(task, /<PracticeItemPager/);
  assert.match(task, /unit="Question"/);
  assert.match(task, /previousLabel="Previous"/);
  assert.match(task, /nextLabel="Next"/);
  assert.match(task, /initiallyAnswered=\{\{\}\}/);
  assert.match(pager, /role="progressbar"/);
  assert.match(pager, /aria-valuetext=\{`\$\{unit\} \$\{selectedIndex \+ 1\} of \$\{total\}`\}/);
  assert.match(pager, /role="tablist"/);
  assert.match(pager, /aria-label=\{`Go to \$\{unitLower\} \$\{index \+ 1\} of \$\{total\}`\}/);
  assert.match(pager, /onTabKeyDown/);
  assert.match(pager, /hidden=\{position < 0 \|\| position !== selectedIndex\}/, 'panels stay mounted, so marks and reasons survive a jump');
  assert.match(pager, /unit = 'Item'/, 'grammar/vocabulary keep their Item wording');
  assert.match(pager, /Previous \$\{unitLower\}/);
  assert.match(pager, /Next \$\{unitLower\}/);
  // Each question's Check, mark and saving are unchanged.
  assert.match(task, /\/api\/week\/input\/mark/);
  assert.match(task, /marked\.reason/);
  assert.match(task, /marked\.sourceLine/);
  assert.match(task, /Finish and save/);
});

test('True/False and Yes/No are large, side-by-side, screen-reader-labelled buttons', () => {
  const task = read('components/b1b2/WeekInputTask.tsx');
  assert.match(task, /isShortOptionSet\(question\.options\)/);
  assert.match(task, /grid grid-cols-2 gap-3/);
  assert.match(task, /aria-pressed=\{answer === option\}/);
  assert.match(task, /min-h-14 rounded-xl border-2/);
  assert.match(task, /type="radio"/, 'longer option sets keep their radios');
});

test('the summary appears after the last question and unlocks the server-side gates', () => {
  const task = read('components/b1b2/WeekInputTask.tsx');
  assert.match(task, /inputSummary\(answered, correct, questions\.length\)/);
  assert.match(task, /role="status" className="rounded-xl bg-indigo-50/);
  assert.match(task, /if \(complete && available && signedIn\) router\.refresh\(\)/);
  assert.match(task, /const complete = questions\.length > 0 && answered === questions\.length/);
  assert.match(read('lib/curriculum/learner-week.ts'), /questionsAnswered = questions\.length > 0 && answered === questions\.length/);
});

test('Check four words is one word at a time, with feedback and a short score', () => {
  const support = read('components/b1b2/ListeningSupport.tsx');
  const reading = read('components/b1b2/ReadingSupport.tsx');
  assert.match(support, /unit="Word"/);
  assert.match(support, /showPrevious=\{false\}/);
  assert.match(support, /nextLabel="Next"/);
  assert.match(support, /min-h-14 rounded-xl border-2/, 'large option buttons');
  assert.match(support, /<PracticeItemPager/);
  assert.match(support, /role="status"/, 'one-line feedback after each answer');
  assert.match(support, /glossCheckScore\(correctCount, items\.length\)/);
  assert.match(reading, /endpoint="\/api\/week\/reading\/gloss"/, 'reading shares the same check');
  assert.equal(readingContent.weeks.every((week) => week.glossCheck.length === 4), true);
});

test('the reading text is a fixed phone panel and a sticky desktop left column', () => {
  const reading = read('components/b1b2/ReadingSupport.tsx');
  assert.match(reading, /Show the text/);
  assert.match(reading, /Close the text/);
  assert.match(reading, /readingTextPanelClass\(textOpen\)/);
  assert.match(reading, /READING_TEXT_INNER_CLASS/);
  assert.match(reading, /role=\{textOpen \? 'dialog' : undefined\}/);
  assert.match(reading, /aria-modal=\{textOpen \? true : undefined\}/);
  assert.match(reading, /event\.key === 'Escape'/);
  assert.match(reading, /lg:grid lg:grid-cols-2 lg:items-start/);
  assert.match(reading, /IntersectionObserver/, 'the fixed button leaves with its section');
  assert.match(reading, /matchMedia\('\(min-width: 1024px\)'\)/, 'no phone dialog survives a desktop resize');
  assert.match(readingTextPanelClass(true), /fixed inset-0 z-40/);
  assert.match(readingTextPanelClass(true), /lg:static/);
  assert.match(readingTextPanelClass(false), /^hidden lg:block/);
  assert.match(READING_TEXT_BUTTON_CLASS, /fixed bottom-4 left-4/);
  assert.match(READING_TEXT_BUTTON_CLASS, /lg:hidden/);
});

test('the small replay player has one audio element, fixed phone position and desktop column', () => {
  const player = read('components/b1b2/ListeningTrialPlayer.tsx');
  const page = read('src/app/week/[n]/page.tsx');
  assert.equal((player.match(/<audio\s+ref=/g) ?? []).length, 1, 'one audio element drives both players');
  assert.match(player, /data-testid="listening-mini-player"/);
  assert.match(player, /aria-pressed=\{playing\}/, 'play/pause exposes its state');
  assert.match(player, /⟲ 5 s/);
  assert.match(player, /aria-label="Back 5 seconds"/);
  assert.match(player, /formatClock\(seconds\)\} \/ \{formatClock\(duration\)/, 'the time');
  assert.match(player, /onMiniKeyDown/, 'keyboard shortcuts');
  assert.match(player, /IntersectionObserver/, 'appears once the full player is scrolled past');
  assert.match(player, /MINI_PLAYER_WRAPPER_CLASS/);
  assert.match(player, /lg:col-span-3/, 'questions column');
  assert.match(player, /lg:sticky lg:top-20/, 'beside the questions on a computer');
  assert.match(MINI_PLAYER_WRAPPER_CLASS, /fixed inset-x-0 bottom-0/);
  assert.match(MINI_PLAYER_WRAPPER_CLASS, /lg:static/);
  assert.match(page, /<ListeningTrialPlayer trial=\{trialAudio\}>/, 'questions and transcript are inside the player section');
  assert.match(player, /pb-28 lg:col-span-3 lg:pb-0/, 'phone content clears the bottom bar');
});

test('CI runs the new checks', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /tests\/unit\/week-input-layout\.test\.mjs/);
  assert.match(ci, /tests\/unit\/migration-history-docs\.test\.mjs/);
});

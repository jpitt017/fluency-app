import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  WEEK_TASKS,
  WEEK_OVERVIEW_ANCHOR,
  nextWeekTask,
  weekTaskMinutesText,
  ACTION_BUTTON_CLASS,
} from '../../lib/curriculum/week-tasks.mjs';
import { nextTaskAfter } from '../../lib/curriculum/week-practice.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the overview lists the six tasks in tour order, with the dashboard anchors', () => {
  assert.deepEqual(WEEK_TASKS.map((task) => task.key), [
    'grammar', 'vocabulary', 'reading', 'listening', 'speaking', 'writing',
  ]);
  assert.deepEqual(WEEK_TASKS.map((task) => task.anchor), [
    'grammar-practice', 'vocabulary-practice', 'reading-practice',
    'listening-practice', 'speaking-practice', 'writing-practice',
  ]);
  // Rough time labels only: no content carries authored timing.
  for (const task of WEEK_TASKS) {
    assert.equal(typeof task.minutes, 'number');
    assert.ok(task.minutes > 0, `${task.key} needs minutes`);
  }
  assert.equal(weekTaskMinutesText(10), '10 min');
});

test('every task ends with "Next: … →", and the tour agrees with the finish buttons', () => {
  assert.deepEqual(nextWeekTask(WEEK_TASKS, 'grammar'), { label: 'Next: Vocabulary →', href: '#vocabulary-practice' });
  assert.deepEqual(nextWeekTask(WEEK_TASKS, 'vocabulary'), { label: 'Next: Reading →', href: '#reading-practice' });
  assert.deepEqual(nextWeekTask(WEEK_TASKS, 'reading'), { label: 'Next: Listening →', href: '#listening-practice' });
  assert.deepEqual(nextWeekTask(WEEK_TASKS, 'listening'), { label: 'Next: Speaking →', href: '#speaking-practice' });
  assert.deepEqual(nextWeekTask(WEEK_TASKS, 'speaking'), { label: 'Next: Writing →', href: '#writing-practice' });
  assert.deepEqual(nextWeekTask(WEEK_TASKS, 'writing'), { label: 'Next: Week overview →', href: `#${WEEK_OVERVIEW_ANCHOR}` });

  // The finish summaries use nextTaskAfter; the accordion footers use
  // nextWeekTask. The two must never disagree about where a learner goes next.
  for (const key of ['grammar', 'vocabulary', 'reading', 'listening', 'speaking', 'writing']) {
    assert.deepEqual(nextTaskAfter(key), nextWeekTask(WEEK_TASKS, key));
  }
  assert.deepEqual(nextTaskAfter('grammar', { hasVocabulary: true }), nextWeekTask(WEEK_TASKS, 'grammar'));
  assert.deepEqual(nextTaskAfter('grammar', { hasVocabulary: false }).href, '#reading-practice');
});

test('the layout keeps one task open at a time and jumps to the dashboard anchors', () => {
  const layout = read('components/b1b2/WeekTaskLayout.tsx');
  // The task bodies stay mounted; only the hidden attribute flips, so a step's
  // state survives switching tasks.
  assert.match(layout, /hidden=\{!open\}/);
  assert.match(layout, /aria-expanded=\{open\}/);
  // Overview cards jump to the same section ids the dashboard links use.
  assert.match(layout, /href=\{`#\$\{task\.anchor\}`\}/);
  assert.match(layout, /id=\{task\.anchor\}/);
  assert.match(layout, /id=\{WEEK_OVERVIEW_ANCHOR\}/);
  // The "Next: … →" button opens the target and moves focus there.
  assert.match(layout, /focusNextTask\(next\.href\.slice\(1\)\)/);
  // A hash for a task (a dashboard deep link, or an overview card) opens it.
  assert.match(layout, /addEventListener\('hashchange'/);
  assert.match(layout, /addEventListener\('week-task:open'/);
  const navigation = read('components/b1b2/usePracticeNavigation.ts');
  assert.match(navigation, /new CustomEvent\('week-task:open', \{ detail: id \}\)/);
});

test('the week page reads the done marks from completions and saved attempts', () => {
  const page = read('src/app/week/[n]/page.tsx');
  assert.match(page, /Boolean\(practice\.grammar\?\.summary\)/);
  assert.match(page, /Boolean\(practice\.vocabulary\?\.summary\)/);
  assert.match(page, /details\.readingSupport\.questionsAnswered/);
  assert.match(page, /details\.listeningSupport\.transcriptUnlocked/);
  assert.match(page, /speakingSupport\.recordings\.length > 0/);
  assert.match(page, /loadWeekOutputSubmissions/);
  assert.match(page, /submissions\.writing/);
});

test('the week page assembles the tasks in one shared slot per task', () => {
  const page = read('src/app/week/[n]/page.tsx');
  assert.match(page, /<WeekTaskLayout tasks=\{tasks\} \/>/);
  assert.match(page, /<GrammarPractice/);
  assert.match(page, /<VocabularyPractice/);
  assert.match(page, /<ReadingPracticeLayout/);
  // The section shells and their h2s moved into the layout; the page no longer
  // renders bare sections with the dashboard ids.
  assert.doesNotMatch(page, /<section id="(?:grammar|vocabulary|reading|listening|speaking|writing)-practice"/);
});

test('the main action is one shared button style in every task', () => {
  assert.ok(ACTION_BUTTON_CLASS.includes('min-h-11'), 'a 44 px minimum touch target');
  assert.ok(ACTION_BUTTON_CLASS.includes('text-sm font-semibold'), 'readable label');
  for (const file of [
    'components/b1b2/GrammarPractice.tsx',
    'components/b1b2/VocabularyPractice.tsx',
    'components/b1b2/WeekInputTask.tsx',
    'components/b1b2/WeekSpeakingSupport.tsx',
    'components/b1b2/PracticeFeedback.tsx',
    'components/b1b2/SentenceBox.tsx',
    'components/b1b2/PersonalSentenceBox.tsx',
    'components/b1b2/GapText.tsx',
  ]) {
    assert.match(read(file), /ACTION_BUTTON_CLASS/, `${file} does not use the shared button`);
  }
  // The shapes that drifted: "Finish and save" was rounded-xl with no text
  // size, and Start recording was a green button of its own.
  const weekInput = read('components/b1b2/WeekInputTask.tsx');
  assert.doesNotMatch(weekInput, /rounded-xl bg-indigo-700/);
  const speaking = read('components/b1b2/WeekSpeakingSupport.tsx');
  assert.doesNotMatch(speaking, /bg-emerald-700/);
  // Stopping a recording is a live control, not the task's main action.
  assert.match(speaking, /Stop recording/);
  assert.match(speaking, /bg-rose-600/);
});

test('learner text is at least 14px; 12px is only for labels', () => {
  // `text-xs` is 12px. The only labels that keep it are the speaking
  // transcript markers ("Week N · speaking", "Transcript", "A better way to
  // say it"); every readable line is text-sm or larger.
  const speaking = read('components/b1b2/WeekSpeakingSupport.tsx');
  assert.equal((speaking.match(/text-xs/g) ?? []).length, 3);
  for (const line of speaking.split('\n')) {
    if (line.includes('text-xs')) {
      assert.match(line, /uppercase/, `12px is for labels only: ${line.trim()}`);
    }
  }
  for (const file of [
    'src/app/week/[n]/page.tsx',
    'components/b1b2/WeekTaskLayout.tsx',
    'components/b1b2/GrammarPractice.tsx',
    'components/b1b2/VocabularyPractice.tsx',
    'components/b1b2/WeekInputTask.tsx',
    'components/b1b2/ListeningSupport.tsx',
    'components/b1b2/ReadingSupport.tsx',
    'components/b1b2/SentenceBox.tsx',
    'components/b1b2/PersonalSentenceBox.tsx',
    'components/b1b2/PracticeItemPager.tsx',
    'components/b1b2/SpeakingRecording.tsx',
    'components/b1b2/WeekSpeakingRecordings.tsx',
    'components/b1b2/SpeakingModelPlayer.tsx',
    'components/b1b2/PracticeFeedback.tsx',
    'components/b1b2/GapText.tsx',
  ]) {
    assert.doesNotMatch(read(file), /text-xs/, `${file} still sets 12px learner text`);
    assert.doesNotMatch(read(file), /stone-400/, `${file} still uses the faded stone-400`);
  }
});

test('feedback colours: green for correct, amber for "not quite", red only for real errors', () => {
  // "Not quite" is amber wherever it is shown; it is not a failure.
  for (const file of [
    'components/b1b2/GrammarPractice.tsx',
    'components/b1b2/VocabularyPractice.tsx',
    'components/b1b2/SentenceBox.tsx',
    'components/b1b2/PersonalSentenceBox.tsx',
    'components/b1b2/GapText.tsx',
    'components/b1b2/PracticeFeedback.tsx',
  ]) {
    for (const line of read(file).split('\n')) {
      if (/Not quite/.test(line)) {
        assert.ok(!/text-red|text-rose/.test(line), `${file} shows "Not quite" in red: ${line.trim()}`);
      }
    }
  }
  // The speaking count failure ("We could not count this…") is a "not quite":
  // amber, not the red error colour.
  const speaking = read('components/b1b2/WeekSpeakingSupport.tsx');
  assert.match(speaking, /text-amber-800">We could not count this/);
  // Red/rose stays on real errors and the live Stop recording control only.
  for (const line of speaking.split('\n')) {
    if (/rose-/.test(line)) {
      assert.ok(/role="alert"|Stop recording/.test(line), `unexpected red: ${line.trim()}`);
    }
  }
});

test('the listening picture shows only when the week has one', () => {
  const support = read('components/b1b2/ListeningSupport.tsx');
  assert.match(support, /support\.intro\.pictureUrl \?/);
  // The empty "Picture coming soon" box is gone.
  assert.doesNotMatch(support, /listening-picture-placeholder/);
  assert.doesNotMatch(support, /Picture coming soon/);
  // The projection sends a real URL only; the authoring brief is not one.
  assert.match(read('lib/curriculum/listening-support.mjs'), /pictureUrl: source\.intro\?\.pictureUrl \?\? null/);
  assert.match(read('lib/curriculum/learner-week.ts'), /pictureUrl: string \| null/);
});

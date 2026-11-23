import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { markInputAnswer, projectInputQuestions } from '../../lib/curriculum/input-marking.mjs';

const details = JSON.parse(readFileSync(new URL('../../supabase-b1-b2/content/curriculum/weeks-01-04-details.json', import.meta.url)));

test('server marking validates all reading and listening keys, including annotated true/false', () => {
  for (const skill of ['reading', 'listening']) for (const week of details[skill].weeks) for (const item of week.questions) {
    const annotated = /^(True|False)\s*\((.+)\)$/i.exec(item.key);
    const correct = item.options.includes(item.key) ? item.key : annotated ? annotated[1] : item.key;
    assert.equal(markInputAnswer(item, correct).correct, true, item.id);
    if (annotated) assert.equal(markInputAnswer(item, correct).reason, annotated[2], item.id);
    if (item.options.length) {
      const wrong = item.options.find(option => option !== correct);
      if (wrong) assert.equal(markInputAnswer(item, wrong).correct, false, item.id);
      assert.throws(() => markInputAnswer(item, 'invalid option'), /available answer/);
    } else {
      assert.equal(markInputAnswer(item, `  ${correct.toUpperCase()}  `).correct, true);
      assert.equal(markInputAnswer(item, 'not the answer').correct, false);
    }
  }
});

test('safe projection excludes answer keys and explanations, including free-text sentinels', () => {
  for (const skill of ['reading', 'listening']) for (const week of details[skill].weeks) {
    const projected = JSON.stringify(projectInputQuestions(week.questions));
    for (const field of ['"key"', '"reason"', '"accepted"']) assert.equal(projected.includes(field), false);
    const sentinel = week.questions.find(item => !item.options.length && !projected.toLowerCase().includes(item.key.toLowerCase()));
    assert.ok(sentinel, `${skill} week ${week.week} needs an unseen answer sentinel`);
    assert.ok(!projected.toLowerCase().includes(sentinel.key.toLowerCase()));
    assert.ok(JSON.stringify({ projected, key: sentinel.key }).includes(sentinel.key), 'sentinel catches an intentional leak');
  }
});

test('rejects malformed and inconsistent authored keys instead of scoring the wrong question', () => {
  assert.throws(() => markInputAnswer({ key: 'missing', options: ['yes', 'no'] }, 'yes'), /does not match/);
  assert.throws(() => markInputAnswer({ key: 'yes', options: ['yes', 'no'] }, ''), /answer/);
  assert.deepEqual(markInputAnswer({ key: 'I would (a past habit)', options: ['I would (a past habit)', 'I had'] }, 'I would (a past habit)'), { correct: true, reason: null });
});

test('every input item has a short draft reason with an exact source quotation', () => {
  const bank = JSON.parse(readFileSync(new URL('../../lib/curriculum/input-reasons.json', import.meta.url)));
  assert.equal(bank.reasonStatus, 'draft, pending teacher review');
  assert.equal(bank.items.length, 80);
  const ids = new Set();
  for (const skill of ['reading', 'listening']) for (const week of details[skill].weeks) for (const question of week.questions) {
    const rows = bank.items.filter(item => item.id === question.id && item.week === week.week && item.skill === skill);
    assert.equal(rows.length, 1, question.id);
    const item = rows[0];
    assert.ok(!ids.has(item.id)); ids.add(item.id);
    assert.equal(item.reasonStatus, 'draft, pending teacher review');
    assert.equal(item.question, question.question);
    assert.equal(item.key, question.key);
    assert.ok(item.reason.trim(), `${question.id} needs a reason`);
    assert.ok(item.sourceLine.trim());
    const quotes = item.sourceLines ?? [item.sourceLine];
    assert.equal(quotes[0], item.sourceLine);
    assert.ok(quotes.length >= 1 && quotes.length <= 2);
    for (const quote of quotes) assert.ok((skill === 'reading' ? week.text : week.script).includes(quote), `${question.id} quotes source exactly`);
    const quotePrefix = quotes.map(quote => `“${quote}”`).join(' ');
    assert.ok(item.reason.startsWith(quotePrefix), `${question.id} begins with its quotation or quotations`);
    if (question.id.includes('-X') || /^(True|False)\b/i.test(question.key)) {
      assert.ok(item.reason.slice(quotePrefix.length).trim(), `${question.id} explains the rule or true/false answer`);
    }
    assert.ok((item.reason.match(/\b[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*\b/gu) ?? []).length < 25, `${question.id} is under 25 words`);
    const safe = JSON.stringify(projectInputQuestions([{ ...question, reason: item.reason, reasonStatus: item.reasonStatus }]));
    assert.ok(!safe.includes(item.reason), `${question.id} reason is not in the initial projection`);
  }
  assert.equal(ids.size, 80);
});

test('teacher review table includes all question IDs and is labelled draft', () => {
  const table = readFileSync(new URL('../../docs/teacher-review/reading-listening-reasons-weeks-01-04.md', import.meta.url), 'utf8');
  assert.match(table, /draft, pending teacher review/);
  const bank = JSON.parse(readFileSync(new URL('../../lib/curriculum/input-reasons.json', import.meta.url)));
  const escape = value => String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  for (const item of bank.items) {
    const cells = [item.week, item.id, item.question, item.key, item.reason, (item.sourceLines ?? [item.sourceLine]).join(' / ')];
    assert.ok(table.includes(`| ${cells.map(escape).join(' | ')} |`), item.id);
  }
});

// --- Reasons for learners, and one answer per request ---------------------

const reasons = JSON.parse(readFileSync(new URL('../../lib/curriculum/input-reasons.json', import.meta.url)));

test('every reading and listening item can explain its answer', () => {
  for (const skill of ['reading', 'listening']) {
    for (const week of details[skill].weeks) {
      for (const item of week.questions) {
        const annotated = /^(True|False)\s*\((.+)\)$/i.exec(item.key);
        const reviewed = reasons.items.find(
          (entry) => entry.week === week.week && entry.skill === skill && entry.id === item.id,
        );
        const reason = (typeof item.reason === 'string' && item.reason.trim()) || annotated?.[2] || reviewed?.reason;
        assert.ok(reason, `${item.id} has no reason on the item or in input-reasons.json`);
        assert.ok(reason.length > 10, `${item.id}'s reason is too thin to teach anything`);
      }
    }
  }
});

test('input-reasons.json never drifts from the item it explains', () => {
  for (const entry of reasons.items) {
    const item = details[entry.skill]?.weeks.find((week) => week.week === entry.week)
      ?.questions.find((question) => question.id === entry.id);
    assert.ok(item, `${entry.id} is in input-reasons.json but not in the item bank`);
    assert.equal(item.question, entry.question, `${entry.id} question text changed`);
  }
});

test('the endpoint returns the reason for the answered item and no other key', () => {
  for (const skill of ['reading', 'listening']) {
    const week = details[skill].weeks[0];
    const item = week.questions[0];
    const annotated = /^(True|False)\s*\((.+)\)$/i.exec(item.key);
    const correct = item.options.includes(item.key) ? item.key : annotated ? annotated[1] : item.key;
    const marked = markInputAnswer(item, correct);
    // A response carries one boolean and one reason -- never the bank.
    assert.deepEqual(Object.keys(marked).sort(), ['correct', 'reason']);
    assert.ok(!JSON.stringify(marked).includes(JSON.stringify(week.questions[1]?.key ?? '')) ||
      week.questions[1]?.key === item.key, `${item.id} response leaked another key`);
  }
});

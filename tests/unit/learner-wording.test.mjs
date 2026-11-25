import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import ts from 'typescript';
import { learnerGrammarReason, LEARNER_GRAMMAR_REASONS } from '../../lib/curriculum/learner-grammar-reasons.mjs';

// Follow learner page/component imports, checking rendered text, not internal names or APIs.
const pages = ['src/app/page.tsx', 'src/app/layout.tsx', 'src/app/dashboard/page.tsx',
  'src/app/labs/page.tsx', 'src/app/review/page.tsx', 'src/app/week/[n]/page.tsx',
  'src/app/portfolio/page.tsx', 'src/app/login/page.tsx', 'src/app/onboarding/placement/page.tsx',
  'src/app/pricing/page.tsx', 'src/app/privacy/page.tsx', 'src/app/terms/page.tsx', 'src/app/syllabus/page.tsx'];
const jargon = /\b(?:fsrs|telemetry|error ledger|error density|deduplicated|rubric|diagnostic|whisper|groq|prosody|latency|retention|populate|ai output studio)\b/i;

// The wording the B1 usability review retired (23 Nov 2026). Teacher pages keep
// their wording; this list is checked only on the learner graph above. Logs and
// thrown Error messages are diagnostics, not learner copy, so they are exempt:
// the detail belongs there once the screen shows the B1 line.
const retired = [
  [/\bLabs\b/, 'Labs / AI Labs / Practice Labs on a learner page'],
  [/\bWriting Studio\b/i, 'Writing Studio'],
  [/\bShadowing Studio\b/i, 'Shadowing Studio'],
  [/\bShadowing Lab\b/i, 'Shadowing Lab'],
  [/\bSpeaking Lab\b/i, 'Speaking Lab'],
  [/\bWriting Lab\b/i, 'Writing Lab'],
  [/conversation labs/i, 'conversation labs'],
  [/B2-ready/, 'Suggested B2-ready phrasing/rewrite'],
  [/Can-Do checkpoint passed/, 'Can-Do checkpoint passed'],
  [/midnight in Madrid/, 'resets at midnight in Madrid'],
  [/daily balance resets/, 'daily balance resets'],
  [/Reference correction/, 'Reference correction'],
  [/flawed (?:part|sentence)/, 'flawed part/sentence'],
  [/Could not verify rewrite/, 'Could not verify rewrite'],
  [/Could not save review/, 'Could not save review'],
  [/Failed to evaluate speech/, 'Failed to evaluate speech'],
  [/An error occurred while analysing/, 'An error occurred while analysing your speech'],
  [/Failed to analyse your writing/, 'Failed to analyse your writing'],
  [/No error review cards due/, 'No error review cards due right now'],
  [/study workspace/, 'B1 → B2 study workspace'],
  [/Signed in, but no browser session was created\. Please try again\./, 'no browser session learner line'],
  [/Your browser blocked session cookies/, 'blocked session cookies learner line'],
  [/unexpected authentication error/i, 'unexpected authentication error'],
  [/Email sending limit reached/, 'Email sending limit reached (Supabase…)'],
  [/Unable to send a sign-in link/, 'Unable to send a sign-in link'],
  [/Placement writing sample/, 'the old placement writing prompt'],
  [/Open (?:speaking|writing) task in Labs/, 'Open … task in Labs'],
  [/Open free practice in Labs/, 'Open free practice in Labs'],
  [/B2 model (?:upgrade|rewrite)/, 'B2 model upgrade/rewrite'],
  [/Stressed key content words/, 'old pronunciation checklist'],
  [/Linked final consonants/, 'old pronunciation checklist'],
  [/rising\/falling sentence intonation/, 'old pronunciation checklist'],
  [/steady B2 rhythm/, 'old pronunciation checklist'],
  [/Narrative pacing|Phrasal linking|Consonant clusters/, 'old pronunciation labels'],
  [/weak form/, 'weak form'],
  [/Hear the model with a UK voice/, 'Hear the model with a UK voice'],
  [/Temporary voice/, 'Temporary voice (say Temporary computer voice)'],
  [/Draft a paragraph, email, review, or essay/, 'old writing practice card'],
  [/Organise your ideas with clear linkers/, 'old speaking practice card'],
  [/AI evaluates content, grammar, vocabulary, and coherence/, 'old speaking AI note'],
  [/shadow aloud with live waveform/, 'old pronunciation intro'],
  [/Model replays:|Self replays:/, 'old replay counters'],
  [/Play UK model|Play studio model|Replay UK model/, 'old model buttons'],
  [/Record your shadow/, 'Record your shadow'],
  [/Your Shadowing Take|Reference Model/, 'old comparison headings'],
  [/All evaluated speaking and writing submissions/, 'old My work intro'],
  [/No evaluated (?:speaking attempts|writing submissions) yet/, 'old My work empty states'],
  [/Detailed reading, listening, speaking and writing tasks have not been published/, 'old empty-week line'],
  [/Word-level diff/, 'Word-level diff'],
  [/Valid unprompted repair verified/, 'Valid unprompted repair verified'],
  [/Mistake & Pattern Drill/, 'Mistake & Pattern Drill'],
  [/Adaptive Review/, 'Adaptive Review'],
  [/Output Archive|Output Portfolio|Study Portfolio/, 'portfolio jargon'],
  [/Mistake Repair Queue|Skill Meters|Live Mastery|Core Practice Studios/, 'home page jargon'],
  [/Speaking Evaluator|Writing & Speaking Evaluator/, 'evaluator headings'],
  [/Multi-Turn Role-Play Coach/, 'Multi-Turn Role-Play Coach'],
  [/Targeted rewrite drills/, 'Targeted rewrite drills'],
];

/** A string used as a diagnostic (console.*, new Error) rather than rendered. */
function isDiagnostic(node) {
  let parent = node.parent;
  if (ts.isNewExpression(parent) && parent.expression.getText() === 'Error') return true;
  if (ts.isCallExpression(parent)) {
    const callee = parent.expression;
    if (ts.isPropertyAccessExpression(callee) && callee.expression.getText() === 'console') return true;
  }
  return false;
}

function inspect(file, seen, violations, extraCheck) {
  const path = resolve(file);
  if (seen.has(path)) return;
  seen.add(path);
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function walk(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const name = node.moduleSpecifier.text;
      const candidate = name.startsWith('@/components/') ? resolve(name.replace('@/', '')) : name.startsWith('.') ? resolve(dirname(path), name) : '';
      if (candidate && existsSync(candidate + '.tsx')) inspect(candidate + '.tsx', seen, violations, extraCheck);
    }
    let text = '';
    if (ts.isJsxText(node)) text = node.text;
    if (ts.isStringLiteral(node) && !ts.isImportDeclaration(node.parent) && !ts.isImportTypeNode(node.parent)
      && !ts.isElementAccessExpression(node.parent) && !ts.isPropertyAssignment(node.parent)
      && !/^(?:className|href|src|id|name|key)$/.test(node.parent.name?.getText?.(source) ?? '')
      && !node.text.startsWith('/api/')) text = node.text;
    if (ts.isStringLiteral(node) && ts.isPropertyAssignment(node.parent) && ['label', 'title', 'text', 'description', 'placeholder', 'action', 'note'].includes(node.parent.name.getText(source))) text = node.text;
    if (ts.isNoSubstitutionTemplateLiteral(node) && ts.isJsxExpression(node.parent)) text = node.text;
    // Privacy policy must identify its actual service provider by name.
    if (relative(process.cwd(), path) === 'src/app/privacy/page.tsx' && text.trim() === 'Groq:') text = '';
    // Only the true branch of the explicit staff-only footer conditional keeps
    // its old label; a learner can only see the false branch, "Practice".
    if (relative(process.cwd(), path) === 'src/app/layout.tsx' && node.parent && ts.isConditionalExpression(node.parent)
      && node.parent.condition.getText(source) === 'isStaff' && node.parent.whenTrue === node) text = '';
    // Diagnostics keep the technical detail; the learner copy may not.
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && isDiagnostic(node)) text = '';
    if (text && jargon.test(text)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      violations.push(`${relative(process.cwd(), path)}:${line}: ${text.trim()}`);
    }
    if (text && extraCheck) extraCheck(text, node, source, path);
    ts.forEachChild(node, walk);
  }
  walk(source);
}

test('learner-facing pages avoid jargon', () => {
  const violations = [];
  const seen = new Set();
  for (const page of pages) inspect(page, seen, violations);
  assert.deepEqual(violations, []);
});

test('the retired wording is gone from learner-facing pages', () => {
  const violations = [];
  const seen = new Set();
  const check = (text, node, source, path) => {
    for (const [pattern, label] of retired) {
      if (pattern.test(text)) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        violations.push(`${relative(process.cwd(), path)}:${line}: ${label} still present: ${text.trim()}`);
      }
    }
  };
  for (const page of pages) inspect(page, seen, violations, check);
  assert.deepEqual(violations, []);
});

test('the shared footer says Practice to learners and keeps the staff label', () => {
  const layout = readFileSync(resolve('src/app/layout.tsx'), 'utf8');
  assert.match(layout, /\{isStaff \? 'Labs' : 'Practice'\}/);
});

test('the speaking route notes a learner reads use the B1 line, not the old studio copy', () => {
  const route = readFileSync(resolve('src/app/api/speaking/evaluate/route.ts'), 'utf8');
  assert.ok(!/Shadowing (?:Lab|Studio)/.test(route), 'the route must not name the old studio');
  assert.ok(!/Evaluated from your spoken transcript/.test(route), 'the old transcript note is gone');
  assert.ok(route.includes('The AI reads what you said and checks your ideas, grammar and words.'), 'the B1 note is in place');
});

test('the grammar and vocabulary banks say it in B1', () => {
  const details = JSON.parse(readFileSync(resolve('supabase-b1-b2/content/curriculum/weeks-01-04-details.json'), 'utf8'));
  const bank = JSON.parse(readFileSync(resolve('supabase-b1-b2/content/curriculum/vocabulary-exercises-weeks-01-04-v2.json'), 'utf8'));

  // "The collocation is…" is B2 metalanguage; the feedback says "We say…".
  assert.ok(!JSON.stringify(bank).includes('The collocation is'), 'collocation metalanguage is gone');
  for (const week of bank.weeks) {
    for (const item of [...week.chooseVerb, ...week.wordForms]) {
      assert.ok(item.reason && !jargon.test(item.reason), `${item.id} reason`);
    }
    // Every gap has an authored reason, so one Check can explain each mark.
    for (const item of week.text.items) {
      assert.ok(typeof item.reason === 'string' && item.reason.length > 10, `${item.id} needs a reason`);
      assert.ok(!jargon.test(item.reason), `${item.id} reason avoids jargon`);
    }
  }

  // The grammar reasons a learner reads after Check avoid clause-level
  // metalanguage, without changing the teacher's authored bank.
  const items = details.weeks.flatMap((week) => week.grammar.practice.items);
  for (const item of items) {
    const reason = learnerGrammarReason(item);
    if (!reason) continue;
    assert.ok(!/\b(?:main clause|full clause|auxiliary)\b/i.test(reason), `${item.id}: ${reason}`);
    assert.ok(!jargon.test(reason), `${item.id}: ${reason}`);
    if (!Object.hasOwn(LEARNER_GRAMMAR_REASONS, item.id)) assert.equal(reason, item.reason);
  }
  assert.deepEqual(Object.keys(LEARNER_GRAMMAR_REASONS).sort(), ['W2-R2', 'W3-L1', 'W4-L1']);
  assert.match(items.find((item) => item.id === 'W2-R2').reason, /main clause/);
  assert.match(items.find((item) => item.id === 'W3-L1').reason, /Auxiliary/);
  assert.match(items.find((item) => item.id === 'W4-L1').reason, /full clause/);
  // Both a newly checked answer and a restored one use the learner copy.
  assert.match(readFileSync(resolve('src/app/api/week/grammar/mark/route.ts'), 'utf8'), /reason: learnerGrammarReason\(item\)/);
  assert.match(readFileSync(resolve('lib/curriculum/week-practice-progress.ts'), 'utf8'), /learnerGrammarReason\(item\)/);
});

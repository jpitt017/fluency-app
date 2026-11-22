import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import ts from 'typescript';

// Follow learner page/component imports, checking rendered text, not internal names or APIs.
const pages = ['src/app/page.tsx', 'src/app/layout.tsx', 'src/app/dashboard/page.tsx',
  'src/app/labs/page.tsx', 'src/app/review/page.tsx', 'src/app/week/[n]/page.tsx',
  'src/app/portfolio/page.tsx', 'src/app/login/page.tsx', 'src/app/onboarding/placement/page.tsx',
  'src/app/pricing/page.tsx', 'src/app/privacy/page.tsx', 'src/app/terms/page.tsx', 'src/app/syllabus/page.tsx'];
const jargon = /\b(?:fsrs|telemetry|error ledger|error density|deduplicated|rubric|diagnostic|whisper|groq|prosody|latency|retention|populate|ai output studio)\b/i;

function inspect(file, seen, violations) {
  const path = resolve(file);
  if (seen.has(path)) return;
  seen.add(path);
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function walk(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const name = node.moduleSpecifier.text;
      const candidate = name.startsWith('@/components/') ? resolve(name.replace('@/', '')) : name.startsWith('.') ? resolve(dirname(path), name) : '';
      if (candidate && existsSync(candidate + '.tsx')) inspect(candidate + '.tsx', seen, violations);
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
    if (jargon.test(text)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      violations.push(`${relative(process.cwd(), path)}:${line}: ${text.trim()}`);
    }
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

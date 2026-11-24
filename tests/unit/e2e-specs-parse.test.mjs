import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Every Playwright spec must parse as plain JavaScript.
 *
 * The browser specs never run before CI, so a syntax error in one is discovered
 * 13 minutes into a Playwright job, after the build and the browser download.
 * This happened: a TypeScript non-null assertion (`match(...)![1]`) in a .mjs
 * spec, which ESLint and tsc both accept and Node rejects.
 *
 * `node --check` parses without running, so it is cheap and needs no browser.
 */
const dir = fileURLToPath(new URL('../e2e/', import.meta.url));
const specs = readdirSync(dir).filter((name) => name.endsWith('.mjs'));

test('the e2e directory has specs to check', () => {
  assert.ok(specs.length > 0, 'no .mjs e2e specs found');
});

for (const spec of specs) {
  test(`${spec} parses as plain JavaScript`, () => {
    const path = new URL(`../e2e/${spec}`, import.meta.url);
    assert.ok(readFileSync(path, 'utf8').length > 0, `${spec} is empty`);
    // Throws with the line and column if it does not parse.
    execFileSync(process.execPath, ['--check', fileURLToPath(path)], { stdio: 'pipe' });
  });
}

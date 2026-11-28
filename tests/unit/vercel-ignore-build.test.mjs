import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The Vercel Ignored Build Step, exercised the way Vercel runs it: a real shell
 * command in a real git checkout, judged only by its exit code.
 *
 *   0 -> skip the deployment
 *   1 -> build
 *
 * A wrong "skip" ships stale code silently, so most of these cases assert that
 * anything unfamiliar builds.
 */

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, '../../scripts/vercel-ignore-build.sh');
const vercelJson = JSON.parse(readFileSync(resolve(here, '../../vercel.json'), 'utf8'));
const vercelIgnore = readFileSync(resolve(here, '../../.vercelignore'), 'utf8').split(/\r?\n/);

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function commit(cwd, files, message) {
  for (const [path, body] of Object.entries(files)) {
    const full = join(cwd, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  git(cwd, 'add', '-A');
  git(cwd, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

/** Run the script with Vercel's environment; returns its exit code. */
function run(cwd, previousSha) {
  const env = { ...process.env };
  delete env.VERCEL_GIT_PREVIOUS_SHA;
  if (previousSha !== undefined) env.VERCEL_GIT_PREVIOUS_SHA = previousSha;
  const result = spawnSync('sh', [script], { cwd, env, encoding: 'utf8' });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

const SKIP = 0;
const BUILD = 1;

/** A repo with one deployed commit, returning the deployed SHA. */
function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'vercel-ignore-'));
  git(repo, 'init', '-q');
  git(repo, 'config', 'commit.gpgsign', 'false');
  const deployed = commit(repo, { 'src/app/page.tsx': 'export default 1;\n', 'package.json': '{}\n' }, 'app v1');
  return { repo, deployed };
}

test('the script is wired into vercel.json and stays executable', () => {
  assert.equal(vercelJson.ignoreCommand, 'sh scripts/vercel-ignore-build.sh');
  // Retention and the separately activated deletion safety net both survive.
  assert.deepEqual(vercelJson.crons, [
    { path: '/api/cron/retention', schedule: '0 4 * * *' },
    { path: '/api/cron/deletion-safety', schedule: '0 5 * * *' },
  ]);
});

test('local scratch and recovery material is never uploaded to Vercel', () => {
  assert.ok(vercelIgnore.some((line) => /^\/?\.arena-work\/?$/.test(line.trim())));
});

test('docs-only pushes skip the deployment', () => {
  const { repo, deployed } = makeRepo();
  try {
    commit(repo, { 'docs/CONTENT_PIPELINE.md': 'a note\n' }, 'docs');
    assert.equal(run(repo, deployed).code, SKIP);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('tests-only pushes skip the deployment', () => {
  const { repo, deployed } = makeRepo();
  try {
    commit(repo, {
      'tests/unit/thing.test.mjs': 'test\n',
      'tests/e2e/other.spec.mjs': 'spec\n',
      'tests/fixtures/x.json': '{}\n',
      'tests/production/live.mjs': 'live\n',
    }, 'tests');
    assert.equal(run(repo, deployed).code, SKIP);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('content-review bookkeeping skips, but app content never does', () => {
  const { repo, deployed } = makeRepo();
  try {
    // Reviewing content is not shipping it: these files do not reach the app.
    commit(repo, { 'supabase-b1-b2/migrations/0040_thing.sql': 'select 1;\n' }, 'migration');
    const afterMigration = run(repo, deployed).code;
    commit(repo, { 'supabase-b1-b2/scripts/validate-details.mjs': '//\n' }, 'validator');
    const afterValidator = run(repo, deployed).code;
    assert.equal(afterMigration, SKIP, 'a migration does not change the app bundle');
    assert.equal(afterValidator, SKIP, 'a validation script does not change the app bundle');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('content that the app imports always builds', () => {
  const { repo, deployed } = makeRepo();
  try {
    // lib/curriculum/*.ts imports these JSON files at build time, so a content
    // edit changes the deployed output even though it is "content".
    commit(repo, { 'supabase-b1-b2/content/curriculum/weeks-01-04-details.json': '{"weeks":[]}\n' }, 'content');
    assert.equal(run(repo, deployed).code, BUILD, 'app-imported curriculum JSON must deploy');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('app, config and infrastructure changes build', () => {
  const { repo, deployed } = makeRepo();
  try {
    for (const path of [
      'src/app/week/[n]/page.tsx',
      'components/b1b2/PlacementQuizClient.tsx',
      'lib/b1b2/data.ts',
      'public/sw.js',
      'package.json',
      'package-lock.json',
      'next.config.ts',
      'vercel.json',
      '.vercelignore',
      'scripts/vercel-ignore-build.sh',
      'tsconfig.json',
    ]) {
      commit(repo, { [path]: `${path}\n` }, `touch ${path}`);
      assert.equal(run(repo, deployed).code, BUILD, `${path} must trigger a build`);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('an unknown new top-level path builds by default', () => {
  const { repo, deployed } = makeRepo();
  try {
    commit(repo, { 'brand-new-tooling/config.yml': 'x: 1\n' }, 'new dir');
    assert.equal(run(repo, deployed).code, BUILD);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('root anchoring holds: docs/ matches, src/docs/ does not', () => {
  const { repo, deployed } = makeRepo();
  try {
    commit(repo, { 'src/docs/notes.md': 'not the same folder\n' }, 'nested docs');
    assert.equal(run(repo, deployed).code, BUILD, 'only the root docs/ folder is skippable');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('a real change hidden under a docs-only tip still builds', () => {
  const { repo, deployed } = makeRepo();
  try {
    // Vercel only builds the tip of a push. This is the case that HEAD^-based
    // examples get wrong: the tip is docs, but the deploy would miss the app fix.
    commit(repo, { 'lib/b1b2/data.ts': 'export const fixed = true;\n' }, 'fix');
    commit(repo, { 'docs/CONTENT_PIPELINE.md': 'documenting the fix\n' }, 'docs on top');
    const result = run(repo, deployed);
    assert.equal(result.code, BUILD, 'must diff against the last deploy, not HEAD^');
    assert.match(result.output, /build input changed: lib\/b1b2\/data\.ts/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('a mixed push builds', () => {
  const { repo, deployed } = makeRepo();
  try {
    commit(repo, { 'docs/x.md': 'doc\n', 'lib/x.ts': 'code\n' }, 'mixed');
    assert.equal(run(repo, deployed).code, BUILD);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('every uncertain case builds rather than skipping', () => {
  const { repo, deployed } = makeRepo();
  try {
    commit(repo, { 'docs/x.md': 'doc\n' }, 'docs');
    assert.equal(run(repo, deployed).code, SKIP, 'a known base with a docs change skips');
    assert.equal(run(repo, undefined).code, BUILD, 'first deploy of a branch builds');
    assert.equal(run(repo, '').code, BUILD, 'empty previous SHA builds');
    assert.equal(run(repo, 'f'.repeat(40)).code, BUILD, 'base outside the shallow clone builds');
    assert.equal(run(repo, 'not-a-sha').code, BUILD, 'a malformed base builds');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('a no-op diff skips, and a deleted doc file skips', () => {
  const { repo, deployed } = makeRepo();
  try {
    assert.equal(run(repo, deployed).code, SKIP, 'nothing changed since the deploy');
    commit(repo, { 'docs/CONTENT_PIPELINE.md': 'x\n' }, 'add doc');
    const withDoc = git(repo, 'rev-parse', 'HEAD');
    rmSync(join(repo, 'docs'), { recursive: true, force: true });
    git(repo, 'add', '-A');
    git(repo, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'delete doc');
    assert.equal(run(repo, withDoc).code, SKIP, 'deleting a doc file does not change the site');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('running from a subdirectory gives the same answer', () => {
  const { repo, deployed } = makeRepo();
  try {
    commit(repo, { 'docs/x.md': 'doc\n' }, 'docs only');
    assert.equal(run(join(repo, 'docs'), deployed).code, SKIP, 'Vercel may run from a subdirectory');
    // And a build input is still detected from there.
    commit(repo, { 'src/app/page.tsx': 'export default 2;\n' }, 'app change');
    assert.equal(run(join(repo, 'docs'), deployed).code, BUILD);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  prepareReviewCardCleanupSql,
  validateCleanupManifest,
} from '../../scripts/prepare-review-cards-cleanup-pr117.mjs';

const manifest = JSON.parse(
  readFileSync('docs/rollouts/review-cards-cleanup-pr117-manifest.json', 'utf8'),
);

test('PR #117 cleanup manifest validates with exact disjoint counts', () => {
  const validated = validateCleanupManifest(manifest);
  assert.equal(validated.repair.length, 1);
  assert.equal(validated.suspend.length, 24);
  assert.equal(validated.deleteTestCards.length, 8);
  assert.equal(validated.expectedUntouchedGapIds.length, 13);
  assert.equal(validated.repair[0].id, '84f84204-4894-4906-8ee5-1aa35d1d8c0a');
  assert.ok(validated.suspend.some((r) => r.id === 'e1e63e28-8457-4695-af7a-387133c2ff4c'));
});

test('PR #117 cleanup rejects wrong project ref or overlapping IDs', () => {
  assert.throws(
    () => validateCleanupManifest({ ...manifest, projectRef: 'other-project' }),
    /Unexpected projectRef/,
  );

  const overlap = structuredClone(manifest);
  overlap.suspend[0].id = overlap.expectedUntouchedGapIds[0];
  assert.throws(() => validateCleanupManifest(overlap), /Duplicate or overlapping/);
});

test('PR #117 cleanup SQL is atomic, guarded, and scoped strictly to error_review_cards', () => {
  const { sql, sha256 } = prepareReviewCardCleanupSql(manifest);
  assert.match(sha256, /^[0-9a-f]{64}$/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /if v_count <> 1 then/);
  assert.match(sql, /if v_count <> 24 then/);
  assert.match(sql, /if v_count <> 8 then/);
  assert.match(sql, /if v_count <> 13 then/);
  assert.match(sql, /I''m meeting Ana on Thursday at 3 p\.m\./);
  assert.match(sql, /A fixed arrangement\./);
  assert.doesNotMatch(sql, /vocab_cards|learner_errors|schema_migrations|listening_audio_trials/);
});

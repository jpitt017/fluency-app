#!/usr/bin/env node
/**
 * Print only: validate the owner-approved PR #117 live Review-card cleanup
 * manifest and emit one guarded, atomic PostgreSQL DO statement.
 *
 * This script never connects to Supabase or mutates any database.
 * All target rows are pinned by full UUID and observed updated_at timestamp,
 * and every mutation checks exact ROW_COUNT inside one atomic DO block.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PG_TIMESTAMPTZ_RE = /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d(?::?\d\d)?)$/;
const EXPECTED_PROJECT_REF = 'ebzmkhrssgnzmixfsuso';

function sqlString(value) {
  if (typeof value !== 'string') throw new Error('Expected string for SQL literal.');
  if (value.includes('\0')) throw new Error('NUL byte not allowed in SQL literal.');
  return `'${value.replace(/'/g, "''")}'`;
}

function assertUuid(id, label) {
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    throw new Error(`Invalid UUID in ${label}: ${String(id)}`);
  }
  return id.toLowerCase();
}

function assertTimestamp(ts, label) {
  if (typeof ts !== 'string' || !PG_TIMESTAMPTZ_RE.test(ts)) {
    throw new Error(`Invalid timestamptz in ${label}: ${String(ts)}`);
  }
  const iso = ts.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00');
  if (!Number.isFinite(Date.parse(iso))) {
    throw new Error(`Invalid timestamptz in ${label}: ${String(ts)}`);
  }
  return ts;
}

export function validateCleanupManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Cleanup manifest must be an object.');
  }
  if (manifest.projectRef !== EXPECTED_PROJECT_REF) {
    throw new Error(`Unexpected projectRef: expected ${EXPECTED_PROJECT_REF}.`);
  }
  if (!Array.isArray(manifest.repair) || manifest.repair.length !== 1) {
    throw new Error('Manifest must contain exactly 1 repair entry.');
  }
  if (!Array.isArray(manifest.suspend) || manifest.suspend.length !== 24) {
    throw new Error('Manifest must contain exactly 24 suspend entries.');
  }
  if (!Array.isArray(manifest.deleteTestCards) || manifest.deleteTestCards.length !== 8) {
    throw new Error('Manifest must contain exactly 8 deleteTestCards entries.');
  }
  if (!Array.isArray(manifest.expectedUntouchedGapIds) || manifest.expectedUntouchedGapIds.length !== 13) {
    throw new Error('Manifest must list all 13 expectedUntouchedGapIds.');
  }

  const seen = new Set();
  const register = (rawId, group) => {
    const id = assertUuid(rawId, group);
    if (seen.has(id)) {
      throw new Error(`Duplicate or overlapping card ID across cleanup sets: ${id}`);
    }
    seen.add(id);
    return id;
  };

  const repair = manifest.repair.map((entry) => {
    const id = register(entry?.id, 'repair');
    const updatedAt = assertTimestamp(entry?.updatedAt, `repair:${id}`);
    for (const field of ['expectedPrompt', 'expectedCorrected', 'newCorrected', 'newExplanation']) {
      if (typeof entry?.[field] !== 'string' || !entry[field].trim()) {
        throw new Error(`Missing ${field} in repair:${id}`);
      }
    }
    return {
      id,
      updatedAt,
      expectedPrompt: entry.expectedPrompt,
      expectedCorrected: entry.expectedCorrected,
      newCorrected: entry.newCorrected,
      newExplanation: entry.newExplanation,
    };
  });

  const suspend = manifest.suspend.map((entry) => ({
    id: register(entry?.id, 'suspend'),
    updatedAt: assertTimestamp(entry?.updatedAt, `suspend:${entry?.id}`),
  }));

  const deleteTestCards = manifest.deleteTestCards.map((entry) => ({
    id: register(entry?.id, 'deleteTestCards'),
    updatedAt: assertTimestamp(entry?.updatedAt, `deleteTestCards:${entry?.id}`),
  }));

  const expectedUntouchedGapIds = manifest.expectedUntouchedGapIds.map((id) =>
    register(id, 'expectedUntouchedGapIds'),
  );

  return { repair, suspend, deleteTestCards, expectedUntouchedGapIds };
}

function valuesTuples(rows) {
  return rows
    .map((row) => `(${sqlString(row.id)}::uuid, ${sqlString(row.updatedAt)}::timestamptz)`)
    .join(',\n      ');
}

export function prepareReviewCardCleanupSql(manifest) {
  const { repair, suspend, deleteTestCards, expectedUntouchedGapIds } = validateCleanupManifest(manifest);
  const repairRow = repair[0];
  const gapIdsSql = expectedUntouchedGapIds.map((id) => `${sqlString(id)}::uuid`).join(', ');

  const sql = `do $fluency_review_cleanup_pr117$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('fluency-review-cleanup-pr117'));

  -- 1. Pre-check exact repair target (ID, updated_at, prompt, old corrected_sentence, active state).
  select count(*) into v_count
  from public.error_review_cards
  where id = ${sqlString(repairRow.id)}::uuid
    and updated_at = ${sqlString(repairRow.updatedAt)}::timestamptz
    and suspended = false
    and prompt_sentence = ${sqlString(repairRow.expectedPrompt)}
    and corrected_sentence = ${sqlString(repairRow.expectedCorrected)};
  if v_count <> 1 then
    raise exception 'Repair target % missing or changed (matched %); aborting cleanup.', ${sqlString(repairRow.id)}, v_count;
  end if;

  -- 2. Pre-check all 24 suspend targets (exact ID + updated_at + currently active).
  with targets(id, expected_updated_at) as (
    values
      ${valuesTuples(suspend)}
  )
  select count(*) into v_count
  from public.error_review_cards c
  join targets t
    on c.id = t.id
   and c.updated_at = t.expected_updated_at
  where c.suspended = false;
  if v_count <> ${suspend.length} then
    raise exception 'Suspend targets missing or changed (matched % of %); aborting cleanup.', v_count, ${suspend.length};
  end if;

  -- 3. Pre-check all 8 synthetic E2E "Test card." delete targets.
  with targets(id, expected_updated_at) as (
    values
      ${valuesTuples(deleteTestCards)}
  )
  select count(*) into v_count
  from public.error_review_cards c
  join targets t
    on c.id = t.id
   and c.updated_at = t.expected_updated_at
  where c.explanation = 'Test card.'
    and c.prompt_sentence = 'I have moved to Leeds in 2023.';
  if v_count <> ${deleteTestCards.length} then
    raise exception 'Synthetic test-card targets missing or changed (matched % of %); aborting cleanup.', v_count, ${deleteTestCards.length};
  end if;

  -- 4. Pre-check all 13 legacy gap cards exist and remain untouched.
  select count(*) into v_count
  from public.error_review_cards
  where id in (${gapIdsSql})
    and suspended = false;
  if v_count <> ${expectedUntouchedGapIds.length} then
    raise exception 'Expected % untouched active legacy gap cards, found %; aborting cleanup.', ${expectedUntouchedGapIds.length}, v_count;
  end if;

  -- 5. Apply repair (1 card).
  update public.error_review_cards
     set corrected_sentence = ${sqlString(repairRow.newCorrected)},
         explanation = ${sqlString(repairRow.newExplanation)},
         updated_at = now()
   where id = ${sqlString(repairRow.id)}::uuid
     and updated_at = ${sqlString(repairRow.updatedAt)}::timestamptz
     and suspended = false
     and prompt_sentence = ${sqlString(repairRow.expectedPrompt)}
     and corrected_sentence = ${sqlString(repairRow.expectedCorrected)};
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'Expected to repair 1 row, updated %; rolling back.', v_count;
  end if;

  -- 6. Apply suspension (24 cards; error history preserved).
  with targets(id, expected_updated_at) as (
    values
      ${valuesTuples(suspend)}
  )
  update public.error_review_cards c
     set suspended = true,
         updated_at = now()
    from targets t
   where c.id = t.id
     and c.updated_at = t.expected_updated_at
     and c.suspended = false;
  get diagnostics v_count = row_count;
  if v_count <> ${suspend.length} then
    raise exception 'Expected to suspend % rows, updated %; rolling back.', ${suspend.length}, v_count;
  end if;

  -- 7. Delete 8 synthetic E2E "Test card." rows.
  with targets(id, expected_updated_at) as (
    values
      ${valuesTuples(deleteTestCards)}
  )
  delete from public.error_review_cards c
   using targets t
   where c.id = t.id
     and c.updated_at = t.expected_updated_at
     and c.explanation = 'Test card.'
     and c.prompt_sentence = 'I have moved to Leeds in 2023.';
  get diagnostics v_count = row_count;
  if v_count <> ${deleteTestCards.length} then
    raise exception 'Expected to delete % synthetic test rows, deleted %; rolling back.', ${deleteTestCards.length}, v_count;
  end if;
end $fluency_review_cleanup_pr117$;
`;

  const sha256 = createHash('sha256').update(sql).digest('hex');
  return { sql, sha256 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const manifest = JSON.parse(readFileSync('docs/rollouts/review-cards-cleanup-pr117-manifest.json', 'utf8'));
  const { sql, sha256 } = prepareReviewCardCleanupSql(manifest);
  if (process.argv.includes('--digest')) {
    process.stdout.write(`${sha256}\n`);
  } else {
    process.stdout.write(sql);
  }
}

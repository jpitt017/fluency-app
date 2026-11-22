#!/usr/bin/env node
/**
 * Fails when the live Supabase project is missing any object the app uses.
 * Uses the read-only verify_app_schema() RPC from migrations 0024/0026, which
 * compares tables, columns, functions, RLS policies, triggers and storage
 * buckets against the inventory parsed from the repo migrations.
 *
 * Set SUPABASE_LIVE_URL to check a specific project in CI; otherwise the app's
 * NEXT_PUBLIC_SUPABASE_URL is used.
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_LIVE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const apiKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_LIVE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !apiKey) {
  throw new Error(
    'Live schema check requires SUPABASE_LIVE_URL (or NEXT_PUBLIC_SUPABASE_URL) and a Supabase API key.',
  );
}

const supabase = createClient(url, apiKey);
const { data, error } = await supabase.rpc('verify_app_schema');

if (error) throw new Error(`verify_app_schema failed: ${error.message}`);

const sections = [
  ['tables', 'missing_tables'],
  ['columns', 'missing_columns'],
  ['functions', 'missing_functions'],
  ['RLS policies', 'missing_policies'],
  ['triggers', 'missing_triggers'],
  ['storage buckets', 'missing_buckets'],
];

const problems = sections
  .map(([label, key]) => {
    const missing = data?.[key];
    if (!Array.isArray(missing)) return `${key}: RPC did not return a list`;
    if (missing.length === 0) return null;
    const preview = missing.slice(0, 8).join(', ');
    const suffix = missing.length > 8 ? ` (+${missing.length - 8} more)` : '';
    return `missing ${label}: ${preview}${suffix}`;
  })
  .filter(Boolean);

if (data?.covered !== true || problems.length > 0) {
  throw new Error(`Live schema does not match the expected objects: ${problems.join('; ') || 'covered=false'}`);
}

const { count, error: placementError } = await supabase
  .from('placement_questions_safe')
  .select('*', { count: 'exact', head: true });
if (placementError) throw new Error(`placement_questions_safe check failed: ${placementError.message}`);
if (count === null || count < 24) {
  throw new Error(`placement_questions_safe has ${count ?? 'unknown'} rows; expected at least 24`);
}
console.log(`PASS: placement_questions_safe has ${count} rows (minimum 24).`);

const checked = data?.checked ?? {};
console.log(
  'PASS: live schema matches expected tables, columns, functions, RLS policies, triggers and buckets ' +
    `(${JSON.stringify(checked)}).`,
);

#!/usr/bin/env node
/**
 * Fails when the live Supabase project is missing any object the app uses.
 * Uses the read-only verify_app_schema() RPC from migrations 0024/0026, which
 * compares tables, columns, functions, RLS policies, triggers and storage
 * buckets against the inventory parsed from the repo migrations.
 *
 * This check is deliberately fail-closed: CI must provide the live URL and an
 * explicit key. It never falls back to the app's NEXT_PUBLIC settings.
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_LIVE_URL;
const apiKey = process.env.SUPABASE_LIVE_ANON_KEY;

if (!url || !apiKey) {
  throw new Error(
    'Live schema check requires SUPABASE_LIVE_URL and the read-only SUPABASE_LIVE_ANON_KEY.',
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
  .select('*', { count: 'exact', head: true })
  .eq('version', 'v2');
if (placementError) throw new Error(`placement_questions_safe check failed: ${placementError.message}`);
if (count === null || count < 24) {
  throw new Error(`placement_questions_safe has ${count ?? 'unknown'} rows; expected at least 24`);
}
console.log(`PASS: placement_questions_safe has ${count} v2 rows (minimum 24).`);
const { count: textCount, error: textError } = await supabase
  .from('placement_texts_safe').select('*', { count: 'exact', head: true });
if (textError) throw new Error(`placement_texts_safe check failed: ${textError.message}`);
if (textCount === null || textCount < 2) throw new Error(`placement_texts_safe has ${textCount ?? 'unknown'} rows; expected at least 2`);
console.log(`PASS: placement_texts_safe has ${textCount} rows (minimum 2).`);

const checked = data?.checked ?? {};
console.log(
  'PASS: live schema matches expected tables, columns, functions, RLS policies, triggers and buckets ' +
    `(${JSON.stringify(checked)}).`,
);
